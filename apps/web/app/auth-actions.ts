"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { laravel, TOKEN_COOKIE } from "@/lib/laravel";

/**
 * Close the signed-in person's own account (`POST /auth/close`). Laravel checks the
 * password, signs every device out and keeps the account for an administrator to restore.
 * What is left here is a cookie for a token that no longer exists, so it goes too.
 */
export async function closeAccountAction(password: string): Promise<{ ok: false; error: string }> {
  const response = await laravel("auth/close", { method: "POST", body: { password } });
  if (!response.ok) {
    const body = (response.body ?? {}) as { error?: string };
    return { ok: false, error: body.error ?? `Something went wrong (${response.status}).` };
  }
  (await cookies()).set(TOKEN_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  // Closed, it doesn't come back here: the sign-in page says what happened.
  redirect("/sign-in?closed=1");
}

/** Revoke the token in Laravel (`DELETE /auth/token`) and forget it here. */
export async function signOutAction(): Promise<void> {
  try {
    await laravel("auth/token", { method: "DELETE" });
  } catch {
    // Laravel being down shouldn't keep someone signed in on this side.
  }
  // Removed with the attributes it was set with: a browser won't let a cookie marked
  // Secure be replaced by one that isn't.
  (await cookies()).set(TOKEN_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}
