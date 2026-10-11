import { cookies, headers } from "next/headers";

/**
 * The one place the web app talks to Laravel.
 *
 * Laravel is the authority: it validates, authorizes and stores. This app holds the
 * Sanctum token in an httpOnly cookie and sends it as a Bearer token from the server,
 * so the browser never sees it and never calls Laravel directly.
 */
export const TOKEN_COOKIE = "nevela_token";

/** Where Nevela's routes live in the Laravel app, e.g. http://127.0.0.1:8000/api. */
export const API_URL = (process.env.NEVELA_API_URL ?? "http://127.0.0.1:8000/api").replace(/\/+$/, "");

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(TOKEN_COOKIE)?.value;
}

/**
 * What Laravel can't see for itself, because this server makes the call and not the
 * browser: where the dashboard is being served from (for the links in emails, and for
 * passkeys, which are tied to that address), and the person's own browser and address
 * (for the list of devices signed in to an account).
 */
export async function callerHeaders(): Promise<Record<string, string>> {
  const incoming = await headers();
  const sent: Record<string, string> = {};
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host");
  if (host) {
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
    sent["X-Nevela-Origin"] = `${incoming.get("x-forwarded-proto")?.split(",")[0] ?? (local ? "http" : "https")}://${host}`;
  }
  const agent = incoming.get("user-agent");
  if (agent) sent["X-Nevela-User-Agent"] = agent.slice(0, 500);
  const address = (incoming.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || incoming.get("x-real-ip");
  if (address) sent["X-Nevela-Ip"] = address.replace(/^::ffff:/, "");
  // That one is for showing: the first entry of X-Forwarded-For is whatever the request
  // came with, and anyone can send one. The address a visitor is *counted* by (the public
  // routes' throttle) has to be one they couldn't have made up. Each proxy adds the
  // address it was called from to the end of the list, so with one proxy in front of this
  // app the last entry is the visitor as that proxy saw them. NEVELA_TRUSTED_PROXIES says
  // how many proxies are in front: 1 unless set, and 0 when this app is reached directly,
  // in which case nobody's word is taken and visitors are counted together.
  const proxies = Number.parseInt(process.env.NEVELA_TRUSTED_PROXIES ?? "1", 10);
  const chain = (incoming.get("x-forwarded-for") ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  const counted = Number.isInteger(proxies) && proxies > 0 ? chain[chain.length - proxies] : undefined;
  sent["X-Nevela-Client"] = counted ? counted.replace(/^::ffff:/, "") : "unknown";
  // Proves to Laravel that this is the dashboard speaking for a browser, and not someone
  // calling the API with made-up headers. The same value is in the Laravel app's .env.
  if (process.env.NEVELA_PROXY_SECRET) sent["X-Nevela-Proxy-Secret"] = process.env.NEVELA_PROXY_SECRET;
  return sent;
}

export interface LaravelRequest {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Defaults to the signed-in user's token; pass null for a request without one. */
  token?: string | null;
}

export interface LaravelResponse {
  status: number;
  ok: boolean;
  /** The parsed JSON body, or null when there was none (204). */
  body: unknown;
}

/** Call Laravel. Never throws for an HTTP error: the status and body come back to the caller. */
export async function laravel(path: string, { method = "GET", body, token }: LaravelRequest = {}): Promise<LaravelResponse> {
  const bearer = token === undefined ? await sessionToken() : token;
  const response = await fetch(`${API_URL}/${path.replace(/^\/+/, "")}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(await callerHeaders()),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    // Every answer depends on who is asking, so nothing here is shared between visitors.
    cache: "no-store",
  });
  const text = response.status === 204 ? "" : await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { error: `Laravel answered ${response.status} with something that isn't JSON.` };
    }
  }
  return { status: response.status, ok: response.ok, body: parsed };
}

export interface PublicRequest {
  /** How long an answer may be reused, in seconds. Default 300. `false` keeps it until one of its tags is revalidated. */
  revalidate?: number | false;
  /** What makes it stale. `resourceTag("Post")` from lib/cache: the dashboard revalidates it when a post is created, changed, deleted or restored. */
  tags?: string[];
}

/**
 * Read what a resource's "public" section opens, for a page anyone can visit.
 *
 * ```ts
 * const { body } = await laravelPublic("posts?sort=-publishedAt", { tags: [resourceTag("Post")] });
 * ```
 *
 * Unlike `laravel()` it carries nothing of the person asking: no token and none of their
 * headers. The answer is the same for everyone, so it is cached and shared between
 * visitors, and a published post appears as soon as the dashboard saves it, because
 * saving revalidates the resource's tag.
 *
 * `path` is under `{api}/public/`. To send a form (a public create), post to
 * `/api/public/<slug>` from the browser: see app/api/[...path]/route.ts.
 */
export async function laravelPublic(path: string, { revalidate = 300, tags = [] }: PublicRequest = {}): Promise<LaravelResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/public/${path.replace(/^\/+/, "")}`, {
      headers: {
        Accept: "application/json",
        // The site reading its own data, to show to many: Laravel doesn't count it against
        // a visitor's allowance, which it otherwise would against this server's address.
        ...(process.env.NEVELA_PROXY_SECRET ? { "X-Nevela-Proxy-Secret": process.env.NEVELA_PROXY_SECRET } : {}),
      },
      next: { revalidate, tags },
    });
  } catch {
    return { status: 502, ok: false, body: { error: "Can't reach the API." } };
  }
  const text = response.status === 204 ? "" : await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { error: `Laravel answered ${response.status} with something that isn't JSON.` };
    }
  }
  return { status: response.status, ok: response.ok, body: parsed };
}
