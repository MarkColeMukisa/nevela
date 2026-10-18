/**
 * How people sign in to this app.
 *
 * Written by `php nevela generate` from the "auth" section of config/nevela.php in the
 * Laravel app. Change a setting there, then generate again: Laravel refuses a method
 * that is switched off, and this file keeps the screens from offering it.
 *
 * Email and password sign-in is always available.
 */
export type SocialProvider = "google" | "github" | "apple" | "microsoft";

// nevela:generated:start hash=f61dde748946
export const authConfig = {
  /** People can create their own account at /sign-up. */
  registration: false,
  /** A sign-in link by email. */
  magicLink: true,
  /** A 6-digit sign-in code by email. */
  emailOtp: true,
  /** Face ID, Touch ID, Windows Hello or a security key. */
  passkeys: true,
  twoFactor: {
    /** Codes from an authenticator app (TOTP), with backup codes. */
    authenticator: true,
    /** Codes by email as the second step. */
    email: true,
  },
  /** Refuse password sign-in until the email address is verified. */
  requireEmailVerification: false,
  /** Check new passwords against Have I Been Pwned's breach list. */
  checkBreachedPasswords: true,
  /** People can close their own account, from the Account page. */
  closeAccount: true,
  /**
   * Always empty here. Which of Google and GitHub show is asked of Laravel on each
   * page, so SOCIAL_AUTH_ENABLED needs no generate or rebuild: see lib/social.ts.
   */
  social: [] as SocialProvider[],
};
// nevela:generated:end

/** Whether any second factor can be set up. */
export const twoFactorAvailable = authConfig.twoFactor.authenticator || authConfig.twoFactor.email;

/** The social providers that are switched on and configured. None yet. */
export function enabledSocialProviders(): SocialProvider[] {
  return authConfig.social;
}
