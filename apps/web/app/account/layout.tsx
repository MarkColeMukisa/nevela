import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountNav } from "@/components/account/account-nav";
import { BrandMark } from "@/components/auth/auth-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { APP } from "@/lib/app";
import { authConfig, twoFactorAvailable } from "@/lib/auth-config";
import { visibleResources } from "@/lib/dashboard";
import { noIndex } from "@/lib/seo";
import { requireSession } from "@/lib/session";
import { site } from "@/lib/site";
import { enabledSocialProviders } from "@/lib/social";

/** Behind a sign-in, so nothing here belongs in search results. */
export const metadata: Metadata = { robots: noIndex };

/**
 * The customer area on the public site (the triple tier): a customer's own account, its
 * sign-in and its devices. An app doing both keeps these pages in the dashboard.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  if (APP !== "site") redirect("/dashboard/account");
  const { user } = await requireSession("/account");
  const security = twoFactorAvailable || authConfig.passkeys || (await enabledSocialProviders()).length > 0;
  // What the app shares with them: each resource their role may view (the phone's Browse).
  const records = (await visibleResources()).length > 0;
  // Staff sign in here too: their work is in the admin app.
  const admin = user.staff !== false ? process.env.NEVELA_ADMIN_URL : undefined;

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2.5 font-semibold">
            <BrandMark link={false} className="[&_span_span]:size-8 [&_span_span]:text-base" />
            {site.name}
          </Link>
          <div className="flex items-center gap-3">
            {admin ? (
              <a href={`${admin.replace(/\/+$/, "")}/dashboard`} className="text-sm font-medium text-link hover:underline">
                Open the admin
              </a>
            ) : null}
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Your account</h1>
          <p className="text-sm text-muted-foreground">Your profile, what you have with us, how you sign in, and where you&apos;re signed in.</p>
        </div>
        <AccountNav
          links={[
            { href: "/account", label: "Profile" },
            ...(records ? [{ href: "/account/records", label: "Records" }] : []),
            { href: "/account/notifications", label: "Notifications" },
            { href: "/account/password", label: "Password" },
            ...(security ? [{ href: "/account/security", label: "Security" }] : []),
            { href: "/account/sessions", label: "Devices" },
          ]}
        />
        <div className="flex flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
