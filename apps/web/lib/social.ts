import { cache } from "react";
import type { SocialProvider } from "@/lib/auth-config";
import { laravel } from "@/lib/laravel";

const KNOWN: SocialProvider[] = ["google", "github", "apple", "microsoft"];

/** Laravel's answer to auth/config, asked once per request however many parts of a page need it. */
const signInSettings = cache(async (): Promise<{ social?: unknown; socialNeedsKeys?: unknown }> => {
  try {
    const { ok, body } = await laravel("auth/config", { token: null });
    return ok && body && typeof body === "object" ? (body as { social?: unknown; socialNeedsKeys?: unknown }) : {};
  } catch {
    return {};
  }
});

/**
 * The providers people can sign in with: switched on in the Laravel app
 * (SOCIAL_AUTH_ENABLED) and given their keys there.
 *
 * Asked of Laravel each time a page needs it, so turning the switch on or off takes effect
 * with no `nevela generate` and no rebuild. None when Laravel can't be reached: a button
 * that can't work isn't shown. For a server component; the browser never asks.
 */
export async function enabledSocialProviders(): Promise<SocialProvider[]> {
  const listed = (await signInSettings()).social;
  return Array.isArray(listed) ? KNOWN.filter((provider) => listed.includes(provider)) : [];
}

/**
 * Whether SOCIAL_AUTH_ENABLED is on and no provider has its keys yet, so there is no
 * button to show. Laravel only says so outside production.
 */
export async function socialNeedsKeys(): Promise<boolean> {
  return (await signInSettings()).socialNeedsKeys === true;
}
