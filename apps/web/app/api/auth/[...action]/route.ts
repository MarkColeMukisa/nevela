import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { API_URL, callerHeaders, sessionToken, TOKEN_COOKIE } from "@/lib/laravel";

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
/** A sign-in waiting for its code. Laravel forgets it after the same ten minutes. */
const PENDING_COOKIE = "nevela_2fa";
const PENDING_MAX_AGE = 60 * 10;
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

/** Keep a token Laravel issued in the cookie, and hand the rest of the answer to the browser. */
async function finish(result: { status: number; body: Body }): Promise<Response> {
  const jar = await cookies();
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
    const next = request.nextUrl.searchParams.get("next") ?? "/dashboard";
    const safe = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboard";
    const result = await callLaravel(request, "POST", "magic-link/verify", { token: request.nextUrl.searchParams.get("token") ?? "" });
    const token = result.body.token;
    if (result.status >= 400 || typeof token !== "string") return Response.redirect(new URL("/sign-in?error=link", request.url), 303);
    jar.set(TOKEN_COOKIE, token, cookieOptions(TOKEN_MAX_AGE));
    return Response.redirect(new URL(safe, request.url), 303);
  }

  if (method !== "GET" && !fromThisSite(request)) {
    return Response.json({ error: "That request didn't come from this site.", code: "CROSS_SITE" }, { status: 403 });
  }

  // The profile picture is the request body, not JSON.
  if (method === "PUT" && action === "avatar") {
    if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) return Response.json({ error: "That picture is too large." }, { status: 413 });
    const file = await request.arrayBuffer();
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

  // A password sign-in. With a second step set up there is no token yet: the pending
  // sign-in is remembered here, and the browser is told to ask for the code.
  if (method === "POST" && action === "token") {
    const result = await callLaravel(request, "POST", "token", body);
    if (result.status === 200 && result.body.twoFactor === true && typeof result.body.challenge === "string") {
      jar.set(PENDING_COOKIE, result.body.challenge, cookieOptions(PENDING_MAX_AGE));
      return Response.json({ twoFactorRedirect: true, methods: result.body.methods ?? [] });
    }
    return finish(result);
  }

  // The second step. The browser sends only the code; which sign-in it belongs to is in the cookie.
  if (method === "POST" && (action === "two-factor/send" || action === "two-factor/verify")) {
    const challenge = jar.get(PENDING_COOKIE)?.value;
    if (!challenge) return Response.json({ error: "That sign-in has expired. Start again.", code: "SESSION_EXPIRED" }, { status: 401 });
    const result = await callLaravel(request, "POST", action, { ...body, challenge });
    if (result.body.code === "SESSION_EXPIRED" || result.body.code === "TOO_MANY_ATTEMPTS") jar.set(PENDING_COOKIE, "", cookieOptions(0));
    return finish(result);
  }

  // Whether a sign-in is waiting for its second step, and how it can be completed.
  if (method === "GET" && action === "two-factor/pending") {
    return Response.json({ pending: Boolean(jar.get(PENDING_COOKIE)?.value) });
  }

  return finish(await callLaravel(request, method, action, body));
}

export const GET = (request: NextRequest, context: Context) => handle(request, context, "GET");
export const POST = (request: NextRequest, context: Context) => handle(request, context, "POST");
export const PUT = (request: NextRequest, context: Context) => handle(request, context, "PUT");
export const PATCH = (request: NextRequest, context: Context) => handle(request, context, "PATCH");
export const DELETE = (request: NextRequest, context: Context) => handle(request, context, "DELETE");
