import { ConnectedAccounts, Passkeys, TwoFactor } from "@/components/account/sections";
import { authConfig, enabledSocialProviders, twoFactorAvailable } from "@/lib/auth-config";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Security" };

/** Two-factor, passkeys and the accounts you can sign in with. */
export default async function SecurityPage() {
  const { user } = await requireSession("/dashboard/account/security");
  const providers = enabledSocialProviders();

  return (
    <>
      {twoFactorAvailable && <TwoFactor enabled={user.twoFactorEnabled} hasPassword methods={authConfig.twoFactor} />}
      {authConfig.passkeys && <Passkeys />}
      {providers.length > 0 && <ConnectedAccounts providers={providers} />}
    </>
  );
}
