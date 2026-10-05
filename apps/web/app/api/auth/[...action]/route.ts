import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { API_URL, callerHeaders, sessionToken, TOKEN_COOKIE } from "@/lib/laravel";
import { encodePending, PENDING_COOKIE, PENDING_MAX_AGE, pendingSecondStep, type SecondStepMethod } from "@/lib/second-step";
import { safeRedirectPath } from "@/lib/session";

/**
 * Signing in and looking after an account, for the browser.
 *
 * Every auth screen calls this route (through lib/auth-client.ts), and this route calls
 * Laravel's `auth/…` endpoints. It exists so the browser never holds a token:
 *
 * - when Laravel answers with a token, it goes into an httpOnly cookie and is taken out
 *   of the answer,
 * - a password sign-in that needs a second step is kept in a short-lived httpOnly cookie
 *   until the code arrives, and
 * - every other call has the token from the cookie added on the way through.
 *
 * Laravel decides everything: who may sign in, which methods are switched on, what a
 * password must look like.
 */
export const dynamic = "force-dynamic";

/** Sanctum tokens don't expire unless Laravel is told to; the cookie lasts 30 days. */
const TOKEN_MAX_AGE = 60 * 60 * 24 * 30;
/** The largest profile picture passed on; Laravel enforces its own limit. */
const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

type Context = { params: Promise<{ action: string[] }> };
type Body = Record<string, unknown>;

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

/**
 * A request that changes something has to come from this site's own pages. The cookie is
 * SameSite=Lax, which already keeps it off cross-site POSTs; this refuses them outright.
 */
function fromThisSite(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try {
    return new URL(origin).host === (request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
  } catch {
    return false;
  }
}

async function callLaravel(request: NextRequest, method: string, path: string, body?: Body | ArrayBuffer, contentType?: string) {
  const token = await sessionToken();
  const headers: Record<string, string> = { Accept: "application/json", ...(await callerHeaders()) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = contentType ?? "application/json";

  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/${path}${request.nextUrl.search}`, {
      method,
      headers,
      body: body === undefined ? undefined : body instanceof ArrayBuffer ? body : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { status: 502, body: { error: "Can't reach the server. Is the Laravel app running? Start both with: nevela dev", code: "SERVER_UNREACHABLE" } as Body };
  }
  const text = response.status === 204 ? "" : await response.text();
  let parsed: Body = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as Body;
    } catch {
      parsed = { error: `The server answered ${response.status} with something unexpected.` };
    }
  }
  // Laravel's own validation answers with issues per field; the screens show one message.
  if (!response.ok) {
    const issues = parsed.issues as { message?: string }[] | undefined;
    parsed.error = issues?.[0]?.message ?? (parsed.error as string | undefined) ?? (parsed.message as string | undefined) ?? "Something went wrong. Try again.";
  }
  if (response.status === 429 && !parsed.code) parsed = { error: "Too many attempts. Wait a minute and try again.", code: "TOO_MANY_ATTEMPTS" };
  return { status: response.status, body: parsed };
}

/** A sign-in that needs its second step: Laravel answered with a challenge instead of a token. */
function secondStep(body: Body): { challenge: string; methods: SecondStepMethod[] } | null {
  if (body.twoFactor !== true || typeof body.challenge !== "string") return null;
  return { challenge: body.challenge, methods: (Array.isArray(body.methods) ? body.methods : []) as SecondStepMethod[] };
}

/**
 * Keep a token Laravel issued in the cookie, and hand the rest of the answer to the browser.
 * When Laravel asks for a second step instead (after a password, or an emailed link or code,
 * on an account with two-factor on), the pending sign-in is remembered here and the browser
 * is told to ask for the code.
 */
async function finish(result: { status: number; body: Body }): Promise<Response> {
  const jar = await cookies();
  const waiting = result.status === 200 ? secondStep(result.body) : null;
  if (waiting) {
    jar.set(PENDING_COOKIE, encodePending(waiting), cookieOptions(PENDING_MAX_AGE));
    return Response.json({ twoFactorRedirect: true, methods: waiting.methods });
  }
  const { token, ...rest } = result.body;
  if (typeof token === "string" && token) {
    jar.set(TOKEN_COOKIE, token, cookieOptions(TOKEN_MAX_AGE));
    jar.set(PENDING_COOKIE, "", cookieOptions(0));
  }
  return Response.json(rest, { status: result.status });
}

async function handle(request: NextRequest, context: Context, method: string): Promise<Response> {
  const action = (await context.params).action.join("/");
  if (!/^[a-z0-9/-]+$/i.test(action)) return Response.json({ error: "Not found." }, { status: 404 });
  const jar = await cookies();

  // The link in a sign-in email opens here.
  if (method === "GET" && action === "magic-link") {
    const safe = safeRedirectPath(request.nextUrl.searchParams.get("next"));
    const result = await callLaravel(request, "POST", "magic-link/verify", { token: request.nextUrl.searchParams.get("token") ?? "" });
    // An account with an authenticator app still owes its second step.
    const waiting = result.status === 200 ? secondStep(result.body) : null;
    if (waiting) {
      jar.set(PENDING_COOKIE, encodePending(waiting), cookieOptions(PENDING_MAX_AGE));
      return Response.redirect(new URL(`/two-factor?next=${encodeURIComponent(safe)}`, request.url), 303);
    }
    const token = result.body.token;
    if (result.status >= 400 || typeof token !== "string") return Response.redirect(new URL("/sign-in?error=link", request.url), 303);
    jar.set(TOKEN_COOKIE, token, cookieOptions(TOKEN_MAX_AGE));
    const destination = new URL(safe, request.url);
    // Belt and braces: whatever the path was, the destination is this site.
    return Response.redirect(destination.origin === new URL(request.url).origin ? destination : new URL("/dashboard", request.url), 303);
  }

  if (method !== "GET" && !fromThisSite(request)) {
    return Response.json({ error: "That request didn't come from this site.", code: "CROSS_SITE" }, { status: 403 });
  }

  // The profile picture is the request body, not JSON.
  if (method === "PUT" && action === "avatar") {
    // Nothing is read until it is known who is sending it and how much there is.
    if (!(await sessionToken())) return Response.json({ error: "Sign in first.", code: "UNAUTHENTICATED" }, { status: 401 });
    const length = Number(request.headers.get("content-length"));
    if (!Number.isFinite(length) || length <= 0) return Response.json({ error: "The upload didn't say how large it is." }, { status: 411 });
    if (length > MAX_UPLOAD_BYTES) return Response.json({ error: "That picture is too large." }, { status: 413 });
    const file = await request.arrayBuffer();
    if (file.byteLength > MAX_UPLOAD_BYTES) return Response.json({ error: "That picture is too large." }, { status: 413 });
    return finish(await callLaravel(request, "PUT", "avatar", file, request.headers.get("content-type") ?? "application/octet-stream"));
  }

  let body: Body | undefined;
  if (method !== "GET" && method !== "DELETE") {
    try {
      body = ((await request.json()) ?? {}) as Body;
    } catch {
      body = {};
    }
  }

  // Signing out: the cookie goes whether or not Laravel could be told.
  if (method === "DELETE" && action === "token") {
    const result = await callLaravel(request, "DELETE", "token");
    // Removed with the attributes they were set with: a browser won't let a cookie marked
    // Secure be replaced by one that isn't.
    jar.set(TOKEN_COOKIE, "", cookieOptions(0));
    jar.set(PENDING_COOKIE, "", cookieOptions(0));
    return Response.json({}, { status: result.status === 204 || result.status === 401 ? 200 : result.status });
  }

  // The second step. The browser sends only the code; which sign-in it belongs to is in the cookie.
  if (method === "POST" && (action === "two-factor/send" || action === "two-factor/verify")) {
    const waiting = await pendingSecondStep();
    if (!waiting) return Response.json({ error: "That sign-in has expired. Start again.", code: "SESSION_EXPIRED" }, { status: 401 });
    const result = await callLaravel(request, "POST", action, { ...body, challenge: waiting.challenge });
    if (result.body.code === "SESSION_EXPIRED" || result.body.code === "TOO_MANY_ATTEMPTS") jar.set(PENDING_COOKIE, "", cookieOptions(0));
    return finish(result);
  }

  // Whether a sign-in is waiting for its second step, and how it can be completed.
  if (method === "GET" && action === "two-factor/pending") {
    const waiting = await pendingSecondStep();
    return Response.json({ pending: waiting !== null, methods: waiting?.methods ?? [] });
  }

  return finish(await callLaravel(request, method, action, body));
}

export const GET = (request: NextRequest, context: Context) => handle(request, context, "GET");
export const POST = (request: NextRequest, context: Context) => handle(request, context, "POST");
export const PUT = (request: NextRequest, context: Context) => handle(request, context, "PUT");
export const PATCH = (request: NextRequest, context: Context) => handle(request, context, "PATCH");
export const DELETE = (request: NextRequest, context: Context) => handle(request, context, "DELETE");
