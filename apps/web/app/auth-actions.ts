"use server";

import { cookies } from "next/headers";
import { laravel, TOKEN_COOKIE } from "@/lib/laravel";

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
