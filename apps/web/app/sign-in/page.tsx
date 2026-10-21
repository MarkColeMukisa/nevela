import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInFlow } from "@/components/auth/sign-in-flow";
import { FormMessage } from "@/components/auth/ui";
import { authConfig } from "@/lib/auth-config";
import { enabledSocialProviders, socialNeedsKeys } from "@/lib/social";
import { getSession, safeRedirectPath } from "@/lib/session";
import { site } from "@/lib/site";
import { theme } from "@/lib/theme";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  oauth: "Sign-in with that provider didn't finish. Try again.",
  link: "That sign-in link has expired or was already used. Ask for a new one.",
};

/** Why a sign-in with Google or GitHub didn't finish, as Laravel names it. */
const OAUTH_REASONS: Record<string, string> = {
  NO_ACCOUNT: "There's no account here for that address. Ask an administrator for one.",
  NO_EMAIL: "That account didn't share an email address, so it can't be matched to an account here.",
  EMAIL_NOT_VERIFIED: "Verify your email address with the provider first, then try again.",
  ACCOUNT_CLOSED: "This account was closed. Ask an administrator to restore it.",
  ACCOUNT_DISABLED: "This account has been switched off. Ask an administrator.",
  EMAIL_BLOCKED: "This email can't be used for a new account. Ask an administrator.",
  OAUTH_DENIED: "Sign-in was cancelled.",
  OAUTH_STATE: "That sign-in took too long or was started in another browser. Try again.",
  NOT_ENABLED: "Signing in with that provider isn't switched on.",
};

/** Why a sign-in ended, as proxy.ts and the inactivity warning say it (?reason=, with no ?error=). */
const SIGNED_OUT: Record<string, string> = {
  inactive: "You were signed out after a while with no activity. Sign in again to carry on.",
  idle: "You were signed out because this sign-in wasn't used for a while. Sign in again to carry on.",
  expired: "Your sign-in reached its time limit. Sign in again to carry on.",
  replayed: "For your safety you were signed out: this sign-in was used from somewhere else. Sign in again, and change your password if that wasn't you.",
  "signed-out": "You were signed out. Sign in again to carry on.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; reason?: string; reset?: string; closed?: string }> }) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  if (await getSession()) redirect(next);

  const copy = theme.signIn(site.name);
  return (
    <AuthShell
      page="sign-in"
      title={copy.title}
      subtitle={(copy as { subtitle?: string }).subtitle}
      footer={
        // Only where people may create their own account (config/nevela.php: auth.registration).
        authConfig.registration ? (
          <>
            Don&apos;t have an account?{" "}
            <Link href={`/sign-up?next=${encodeURIComponent(next)}`} className="font-medium text-link hover:underline">
              Sign up
            </Link>
          </>
        ) : undefined
      }
    >
      {(await socialNeedsKeys()) && (
        // Laravel says so outside production only: the switch is on, and no button can be drawn.
        <div className="mb-4">
          <FormMessage tone="info">
            Google and GitHub sign-in is switched on (SOCIAL_AUTH_ENABLED), but neither has its keys, so there are no buttons. Set GOOGLE_CLIENT_ID and
            GOOGLE_CLIENT_SECRET, or GitHub&apos;s, in apps/api/.env. Shown in development only.
          </FormMessage>
        </div>
      )}
      <SignInFlow
        providers={await enabledSocialProviders()}
        socialPlacement={theme.social}
        socialStyle={theme.socialStyle}
        methods={{ magicLink: authConfig.magicLink, emailOtp: authConfig.emailOtp, passkeys: authConfig.passkeys }}
        next={next}
        initialError={
          params.error ? ((params.error === "oauth" && params.reason ? OAUTH_REASONS[params.reason] : undefined) ?? ERRORS[params.error] ?? "Sign-in didn't finish. Try again.") : null
        }
        initialNotice={
          params.reset
            ? "Your password is changed. Sign in with the new one."
            : params.closed
              ? "Your account is closed, and you are signed out everywhere. To have it back, ask an administrator."
              : !params.error && params.reason
                ? (SIGNED_OUT[params.reason] ?? null)
                : null
        }
      />
    </AuthShell>
  );
}
