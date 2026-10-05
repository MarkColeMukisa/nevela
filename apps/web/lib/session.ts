import { cache } from "react";
import { redirect } from "next/navigation";
import { laravel, sessionToken } from "./laravel";

export interface SessionUser {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  /** The key of the profile picture (an optimised upload), or null. Show it with fileUrl(). */
  avatar: string | null;
}

export interface Session {
  user: SessionUser;
  /** Which of the account's devices this is: its id in the list of devices. */
  session: { id: string | null };
}

/**
 * The current session, or null. Asks Laravel (`GET /auth/me`), so a revoked token is
 * signed out on the next request. Cached for the length of one render, so a page that
 * asks ten times makes one call.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  if (!(await sessionToken())) return null;
  const response = await laravel("auth/me");
  if (!response.ok) return null;
  const body = response.body as { user: SessionUser; session?: { id: string | null } };
  return { user: body.user, session: body.session ?? { id: null } };
});

/** The current session; redirects to /sign-in (returning to `returnTo` afterwards) when signed out. */
export async function requireSession(returnTo?: string) {
  const session = await getSession();
  if (!session) {
    redirect(returnTo ? `/sign-in?next=${encodeURIComponent(returnTo)}` : "/sign-in");
  }
  return session;
}

/** Only allow same-site relative redirect targets, to avoid open redirects via `?next=`. */
export function safeRedirectPath(value: unknown, fallback = "/dashboard"): string {
  // One leading slash, and no backslash or control character anywhere. Browsers drop tabs
  // and newlines from an address, which would turn "/<tab>/evil.example" into "//evil.example".
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
  return typeof value === "string" && /^\/(?!\/)[^\\\u0000-\u001f\u007f]*$/.test(value) ? value : fallback;
}
