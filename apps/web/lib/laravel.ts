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
