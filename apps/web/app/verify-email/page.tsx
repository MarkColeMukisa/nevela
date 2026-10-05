import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import { getSession, safeRedirectPath } from "@/lib/session";

export const metadata = { title: "Verify your email" };

/**
 * Confirm an email address: by the code in the message, or by asking for a fresh link
 * when the one they have has expired.
 */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ email?: string; next?: string; code?: string }> }) {
  const { email, next, code } = await searchParams;
  const session = await getSession();
  const to = safeRedirectPath(next, "/dashboard/account");
  if (session?.user.emailVerified) redirect(to);

  return (
    <AuthShell
      title="Verify your email"
      subtitle="One step, so we know we can reach you."
      footer={
        <Link href={session ? "/dashboard" : "/sign-in"} className="font-medium text-link hover:underline">
          {session ? "Back to the dashboard" : "Back to sign in"}
        </Link>
      }
    >
      {/* Codes are always used here: the email carries one, and its link brings it along. */}
      <VerifyEmailForm initialEmail={email ?? session?.user.email ?? ""} initialCode={/^\d{6}$/.test(code ?? "") ? code : undefined} codes next={to} />
    </AuthShell>
  );
}
