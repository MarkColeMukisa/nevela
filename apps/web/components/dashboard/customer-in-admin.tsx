import { BrandMark } from "@/components/auth/auth-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { siteUrl } from "@/lib/seo";

/**
 * What a customer who signs in to the staff's admin app sees: their own account's pages and
 * the way to the site, where their account lives. Nothing of the dashboard, its sidebar or
 * its records: the admin is for the people who run the place.
 */
export function CustomerInAdmin({ children }: { children: React.ReactNode }) {
  const site = siteUrl();
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-3 md:px-6">
        <BrandMark />
        <SignOutButton />
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <div role="status" className="rounded-xl border bg-surface px-4 py-3 text-sm">
          This is where the staff work. Your account is on{" "}
          <a href={site} className="font-medium text-link hover:underline">
            {site.replace(/^https?:\/\//, "")}
          </a>
          . You can still change your profile, password and sign-in here.
        </div>
        {children}
      </main>
    </div>
  );
}
