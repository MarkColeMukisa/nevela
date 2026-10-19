import { API_URL, callerHeadersFrom, REFRESH_COOKIE, TOKEN_COOKIE } from "./laravel";

/**
 * The two cookies a sign-in is kept in, and renewing them.
 *
 * Laravel signs someone in with a short access token (15 minutes unless it is told
 * otherwise) and a refresh token (see Auth\Sessions there). Both live in httpOnly
 * cookies. The access cookie lasts a minute less than its token, so it is gone before
 * Laravel would refuse it; proxy.ts then swaps the refresh token for a new pair before the
 * page or API call that needed it goes ahead. The refresh cookie lasts as long as the
 * sign-in can: until it would end unused, or its absolute limit.
 */

/** What Laravel answers a sign-in or a refresh with. */
export interface SignedIn {
  token?: unknown;
  /** When the access token stops working. */
  expiresAt?: unknown;
  /** A new refresh token, or null when the one held is still the one to use. */
  refreshToken?: unknown;
  /** When the sign-in ends if it isn't used again. Null: never. */
  refreshExpiresAt?: unknown;
}

/** The fields of a sign-in that stay on the server, taken out of what the browser is sent. */
export const SIGN_IN_FIELDS = ["token", "expiresAt", "refreshToken", "refreshExpiresAt"] as const;

/** For a Laravel from before sign-ins ended, which gives one token and no end. */
const UNENDING_MAX_AGE = 60 * 60 * 24 * 30;
/** As long as a browser keeps a cookie at most, for a sign-in with no end. */
const LONGEST_MAX_AGE = 60 * 60 * 24 * 400;

interface CookieJar {
  set(name: string, value: string, options: ReturnType<typeof cookieOptions>): unknown;
}

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

const secondsUntil = (at: unknown): number | null => {
  const time = typeof at === "string" ? Date.parse(at) : Number.NaN;
  return Number.isFinite(time) ? Math.floor((time - Date.now()) / 1000) : null;
};

/** Keep the tokens Laravel gave. False when there was no token in the answer. */
export function keepSignIn(jar: CookieJar, body: SignedIn): boolean {
  if (typeof body.token !== "string" || body.token === "") return false;
  const access = secondsUntil(body.expiresAt);
  jar.set(TOKEN_COOKIE, body.token, cookieOptions(access === null ? UNENDING_MAX_AGE : Math.max(30, access - 60)));
  if (typeof body.refreshToken === "string" && body.refreshToken !== "") {
    const refresh = secondsUntil(body.refreshExpiresAt);
    jar.set(REFRESH_COOKIE, body.refreshToken, cookieOptions(refresh === null ? LONGEST_MAX_AGE : Math.max(0, refresh)));
  } else if (body.expiresAt === undefined) {
    // An older Laravel: one token, no refresh. Nothing is left over from a sign-in before.
    jar.set(REFRESH_COOKIE, "", cookieOptions(0));
  }
  return true;
}

/** Sign this browser out: both cookies go, set as they were set (a browser won't let a Secure cookie be replaced by one that isn't). */
export function forgetSignIn(jar: CookieJar): void {
  jar.set(TOKEN_COOKIE, "", cookieOptions(0));
  jar.set(REFRESH_COOKIE, "", cookieOptions(0));
}

export type Refreshed =
  | { ok: true; body: SignedIn }
  /** `ended`: Laravel said the sign-in is over (`code` says why). Otherwise it couldn't be asked, and nothing is decided. */
  | { ok: false; ended: boolean; code: string };

/** Swap a refresh token for a new pair. `incoming` is the browser's request, for the list of devices. */
export async function refreshSignIn(refreshToken: string, incoming: Headers): Promise<Refreshed> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", ...callerHeadersFrom(incoming) },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, ended: false, code: "SERVER_UNREACHABLE" };
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    // An answer that isn't JSON says nothing about the sign-in.
  }
  if (response.ok && typeof body.token === "string") return { ok: true, body };
  if (response.status === 401) return { ok: false, ended: true, code: typeof body.code === "string" ? body.code : "SESSION_REVOKED" };
  return { ok: false, ended: false, code: "REFRESH_FAILED" };
}

/** What /sign-in is told, as ?reason=, about why a sign-in ended. */
export function signedOutReason(code: string): string {
  return { SESSION_IDLE: "idle", SESSION_EXPIRED: "expired", SESSION_REPLAYED: "replayed" }[code] ?? "signed-out";
}
