"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { laravel } from "@/lib/laravel";
import { forgetSignIn } from "@/lib/session-cookies";

/**
 * Close the signed-in person's own account (`POST /auth/close`). Laravel checks the
 * password, signs every device out and keeps the account for an administrator to restore.
 * What is left here is cookies for tokens that no longer work, so they go too.
 */
export async function closeAccountAction(password: string): Promise<{ ok: false; error: string }> {
  const response = await laravel("auth/close", { method: "POST", body: { password } });
  if (!response.ok) {
    const body = (response.body ?? {}) as { error?: string };
    return { ok: false, error: body.error ?? `Something went wrong (${response.status}).` };
  }
  forgetSignIn(await cookies());
  // Closed, it doesn't come back here: the sign-in page says what happened.
  redirect("/sign-in?closed=1");
}

/** End the sign-in in Laravel (`DELETE /auth/token`) and forget it here. */
export async function signOutAction(): Promise<void> {
  try {
    await laravel("auth/token", { method: "DELETE" });
  } catch {
    // Laravel being down shouldn't keep someone signed in on this side.
  }
  forgetSignIn(await cookies());
}
