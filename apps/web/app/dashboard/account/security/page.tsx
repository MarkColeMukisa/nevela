import { ConnectedAccounts, Passkeys, TwoFactor } from "@/components/account/sections";
import { authConfig, twoFactorAvailable } from "@/lib/auth-config";
import { requireSession } from "@/lib/session";
import { enabledSocialProviders } from "@/lib/social";

/** What became of connecting a provider, by what Laravel answered: the provider sends the browser back here. */
const CONNECTING: Record<string, string> = {
  ALREADY_LINKED: "That account is connected to another account here.",
  NO_EMAIL: "That account didn't share an email address.",
  OAUTH_DENIED: "Connecting it was cancelled.",
  OAUTH_STATE: "That took too long. Try again.",
  NOT_ENABLED: "Signing in with that provider isn't switched on.",
};

export const metadata = { title: "Security" };

/** Two-factor, passkeys and the accounts you can sign in with. */
export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ social?: string; required?: string }> }) {
  const { user } = await requireSession("/dashboard/account/security");
  const providers = await enabledSocialProviders();
  const { social, required } = await searchParams;
  const connecting = social === undefined || social === "linked" ? null : (CONNECTING[social] ?? "Connecting it didn't finish. Try again.");

  return (
    <>
      {required === "1" && !user.twoFactorEnabled ? (
        <div role="status" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          Staff need two-step sign-in to use the admin. Turn it on below, and the rest of the admin opens.
        </div>
      ) : null}
      {twoFactorAvailable && <TwoFactor enabled={user.twoFactorEnabled} hasPassword methods={authConfig.twoFactor} />}
      {authConfig.passkeys && <Passkeys />}
      {providers.length > 0 && <ConnectedAccounts providers={providers} initialError={connecting} />}
    </>
  );
}
