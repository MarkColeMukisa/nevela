import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { DashboardHeader, type Theme } from "@/components/dashboard/dashboard-header";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { SessionWatchdog } from "@/components/dashboard/session-watchdog";
import { dashboardLinks } from "@/lib/dashboard-nav";
import { allResources, dashboardSession, mayDo } from "@/lib/dashboard";
import { sidebarTabs } from "@/lib/layout";
import { navigableResources } from "@/lib/lines";
import { fileUrl } from "@/lib/files";
import { loadInbox } from "@/lib/notifications";
import { noIndex } from "@/lib/seo";
import { requireSession } from "@/lib/session";
import { site } from "@/lib/site";
import { APP, PATH_HEADER } from "@/lib/app";
import { CustomerInAdmin } from "@/components/dashboard/customer-in-admin";
import { staffTwoFactorRequired } from "@/lib/social";
import { twoFactorAvailable } from "@/lib/auth-config";
import { listViews } from "@/lib/views";

/** Behind a sign-in, so nothing here belongs in search results. */
export const metadata: Metadata = { robots: noIndex };

/**
 * The frame around every signed-in page: the app's resources in the sidebar, the
 * account menu in the header and in the sidebar's footer.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession("/dashboard");
  // The staff's admin app keeps a customer to their own account: as Grit does, not a door
  // shut in their face. Laravel still checks every request whatever is shown here.
  if (APP === "admin" && user.staff === false) {
    const page = (await headers()).get(PATH_HEADER) ?? "";
    if (page !== "/dashboard/account" && !page.startsWith("/dashboard/account/")) redirect("/dashboard/account");
    return <CustomerInAdmin>{children}</CustomerInAdmin>;
  }
  // Staff in the admin with two-step sign-in off, where the app asks for it: their account's
  // security page, to turn it on, and nothing else until they have.
  if (APP === "admin" && twoFactorAvailable && !user.twoFactorEnabled && (await staffTwoFactorRequired())) {
    const page = (await headers()).get(PATH_HEADER) ?? "";
    if (page !== "/dashboard/account/security") redirect("/dashboard/account/security?required=1");
  }
  const jar = await cookies();
  const theme = (jar.get("flare-theme")?.value ?? "system") as Theme;
  const collapsed = jar.get("sidebar_state")?.value === "false";

  const views = await listViews();
  const resources = (await navigableResources()).map((resource) => ({
    name: resource.name,
    pluralLabel: resource.pluralLabel,
    slug: resource.slug,
    icon: resource.icon,
    group: resource.group,
    views: views.filter((view) => view.resource === resource.name).map(({ id, name, query }) => ({ id, name, query })),
  }));

  const account = { name: user.name, email: user.email, image: user.avatar ? fileUrl(user.avatar, "thumb") : null };
  // The screens for managing people, for those whose roles allow it.
  const { isAdmin, may } = await dashboardSession();
  // Deleted accounts are for whoever may delete one: the same people who can put it there.
  const access = { users: may("users.view"), roles: may("roles.view"), deleted: may("users.delete"), activity: may("activity.view") };
  // The trash is for those who may delete: whoever can put a record there can deal with it there.
  const trash = (await Promise.all(allResources().map((resource) => mayDo(resource, "delete")))).some(Boolean);
  // What the bell shows first. It asks again by itself from then on.
  const inbox = await loadInbox();
  // First under Home, as on the phone: packages/shared/layout.ts.
  const tabs = await sidebarTabs();

  return (
    <SidebarProvider defaultOpen={!collapsed}>
      <DashboardSidebar appName={site.name} resources={resources} tabs={tabs} links={dashboardLinks} isAdmin={isAdmin} access={access} trash={trash} user={account} />
      {/* min-w-0: a flex item is at least as wide as what is in it, so a wide table widened the page. Now it scrolls in its own box. */}
      <SidebarInset className="min-w-0">
        <DashboardHeader user={account} initialTheme={theme} inbox={inbox} />
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">{children}</main>
      </SidebarInset>
      <Toaster theme={theme} />
      <SessionWatchdog />
    </SidebarProvider>
  );
}
