"use server";

import { cookies } from "next/headers";
import { laravel, TOKEN_COOKIE } from "@/lib/laravel";

export type SignInResult = { ok: true } | { ok: false; error: string };

/** Sanctum tokens don't expire unless Laravel is told to; the cookie lasts 30 days. */
const MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Exchange an email and password for a Sanctum token (`POST /auth/token`) and keep it
 * in an httpOnly cookie. The browser never holds the token itself.
 */
export async function signInAction(email: string, password: string): Promise<SignInResult> {
  let response;
  try {
    response = await laravel("auth/token", { method: "POST", body: { email, password }, token: null });
  } catch {
    return { ok: false, error: "Can't reach the server. Check that the Laravel app is running." };
  }
  if (!response.ok) {
    const body = (response.body ?? {}) as { error?: string; issues?: { message: string }[] };
    if (response.status === 429) return { ok: false, error: "Too many attempts. Wait a minute and try again." };
    return { ok: false, error: body.issues?.[0]?.message ?? body.error ?? "Sign-in failed. Try again." };
  }

  const { token } = response.body as { token: string };
  (await cookies()).set(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  return { ok: true };
}

/** Revoke the token in Laravel (`DELETE /auth/token`) and forget it here. */
export async function signOutAction(): Promise<void> {
  try {
    await laravel("auth/token", { method: "DELETE" });
  } catch {
    // Laravel being down shouldn't keep someone signed in on this side.
  }
  (await cookies()).delete(TOKEN_COOKIE);
}
