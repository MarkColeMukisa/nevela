import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { DashboardHeader, type Theme } from "@/components/dashboard/dashboard-header";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { SessionWatchdog } from "@/components/dashboard/session-watchdog";
import { dashboardLinks } from "@/lib/dashboard-nav";
import { allResources, dashboardSession, mayDo } from "@/lib/dashboard";
import { navigableResources } from "@/lib/lines";
import { fileUrl } from "@/lib/files";
import { loadInbox } from "@/lib/notifications";
import { noIndex } from "@/lib/seo";
import { requireSession } from "@/lib/session";
import { site } from "@/lib/site";
import { listViews } from "@/lib/views";

/** Behind a sign-in, so nothing here belongs in search results. */
export const metadata: Metadata = { robots: noIndex };

/**
 * The frame around every signed-in page: the app's resources in the sidebar, the
 * account menu in the header and in the sidebar's footer.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession("/dashboard");
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

  return (
    <SidebarProvider defaultOpen={!collapsed}>
      <DashboardSidebar appName={site.name} resources={resources} links={dashboardLinks} isAdmin={isAdmin} access={access} trash={trash} user={account} />
      <SidebarInset>
        <DashboardHeader user={account} initialTheme={theme} inbox={inbox} />
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">{children}</main>
      </SidebarInset>
      <Toaster theme={theme} />
      <SessionWatchdog />
    </SidebarProvider>
  );
}
