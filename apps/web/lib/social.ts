import type { SocialProvider } from "@/lib/auth-config";
import { laravel } from "@/lib/laravel";

const KNOWN: SocialProvider[] = ["google", "github", "apple", "microsoft"];

/**
 * The providers people can sign in with: switched on in the Laravel app
 * (SOCIAL_AUTH_ENABLED) and given their keys there.
 *
 * Asked of Laravel each time a page needs it, so turning the switch on or off takes effect
 * with no `nevela generate` and no rebuild. None when Laravel can't be reached: a button
 * that can't work isn't shown. For a server component; the browser never asks.
 */
export async function enabledSocialProviders(): Promise<SocialProvider[]> {
  try {
    const { ok, body } = await laravel("auth/config", { token: null });
    const listed = ok ? (body as { social?: unknown }).social : [];
    return Array.isArray(listed) ? KNOWN.filter((provider) => listed.includes(provider)) : [];
  } catch {
    return [];
  }
}
