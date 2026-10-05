import { Password } from "@/components/account/sections";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Password" };

export default async function PasswordPage() {
  const { user } = await requireSession("/dashboard/account/password");
  // Every Laravel account has a password; there are no social-only accounts yet.
  return <Password hasPassword email={user.email} />;
}
