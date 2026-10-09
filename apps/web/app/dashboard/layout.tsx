import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { DashboardHeader, type Theme } from "@/components/dashboard/dashboard-header";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { dashboardLinks } from "@/lib/dashboard-nav";
import { allResources, dashboardSession, mayDo, visibleResources } from "@/lib/dashboard";
import { fileUrl } from "@/lib/files";
import { requireSession } from "@/lib/session";
import { site } from "@/lib/site";
import { listViews } from "@/lib/views";

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
  const resources = (await visibleResources()).map((resource) => ({
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
  const access = { users: may("users.view"), roles: may("roles.view"), deleted: may("users.delete") };
  // The trash is for those who may delete: whoever can put a record there can deal with it there.
  const trash = (await Promise.all(allResources().map((resource) => mayDo(resource, "delete")))).some(Boolean);

  return (
    <SidebarProvider defaultOpen={!collapsed}>
      <DashboardSidebar appName={site.name} resources={resources} links={dashboardLinks} isAdmin={isAdmin} access={access} trash={trash} user={account} />
      <SidebarInset>
        <DashboardHeader user={account} initialTheme={theme} notices={[]} />
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">{children}</main>
      </SidebarInset>
      <Toaster theme={theme} />
    </SidebarProvider>
  );
}
