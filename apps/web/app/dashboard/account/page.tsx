import { CloseAccount, Profile } from "@/components/account/sections";
import { authConfig } from "@/lib/auth-config";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { user } = await requireSession("/dashboard/account");
  return (
    <>
      <Profile
        user={{
          name: user.name ?? "",
          email: user.email,
          emailVerified: user.emailVerified,
          twoFactorEnabled: user.twoFactorEnabled,
          avatar: user.avatar,
        }}
      />
      {/* Only where people may close their own (config/nevela.php: auth.close_account). */}
      {authConfig.closeAccount && <CloseAccount email={user.email} />}
    </>
  );
}
