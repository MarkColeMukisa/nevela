import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";
import { getSession, safeRedirectPath } from "@/lib/session";
import { site } from "@/lib/site";
import { theme } from "@/lib/theme";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  if (await getSession()) redirect(next);

  const copy = theme.signIn(site.name);
  return (
    <AuthShell page="sign-in" title={copy.title} subtitle={(copy as { subtitle?: string }).subtitle}>
      <SignInForm next={next} />
    </AuthShell>
  );
}
