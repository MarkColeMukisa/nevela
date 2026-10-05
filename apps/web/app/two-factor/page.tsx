import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { TwoFactorForm } from "@/components/auth/two-factor-form";
import { redirect } from "next/navigation";
import { pendingSecondStep } from "@/lib/second-step";
import { safeRedirectPath } from "@/lib/session";

export const metadata = { title: "Verify it's you" };

/** Reached after a correct password on an account with two-factor on (lib/auth-client.ts sends people here). */
export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Nothing is waiting: they came here directly, or took more than ten minutes.
  const waiting = await pendingSecondStep();
  if (!waiting) redirect(`/sign-in?next=${encodeURIComponent(safeRedirectPath(next))}`);
  return (
    <AuthShell
      title="Verify it's you"
      subtitle="Your account uses two-factor authentication."
      footer={
        <Link href="/sign-in" className="font-medium text-link hover:underline">
          Use a different account
        </Link>
      }
    >
      {/* What Laravel said this sign-in can be finished with: after an emailed link, not another email. */}
      <TwoFactorForm
        methods={{ authenticator: waiting.methods.includes("totp"), email: waiting.methods.includes("email") }}
        backup={waiting.methods.includes("backup")}
        next={safeRedirectPath(next)}
      />
    </AuthShell>
  );
}
