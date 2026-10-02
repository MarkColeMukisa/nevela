import { cache } from "react";
import { redirect } from "next/navigation";
import { laravel, sessionToken } from "./laravel";

export interface SessionUser {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
}

export interface Session {
  user: SessionUser;
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
  return { user: (response.body as { user: SessionUser }).user };
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
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
    ? value
    : fallback;
}
