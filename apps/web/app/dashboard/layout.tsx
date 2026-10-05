import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { DashboardHeader, type Theme } from "@/components/dashboard/dashboard-header";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { dashboardLinks } from "@/lib/dashboard-nav";
import { ADMIN_ROLES, visibleResources } from "@/lib/dashboard";
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

  return (
    <SidebarProvider defaultOpen={!collapsed}>
      <DashboardSidebar appName={site.name} resources={resources} links={dashboardLinks} isAdmin={ADMIN_ROLES.includes(user.role ?? "")} user={account} />
      <SidebarInset>
        <DashboardHeader user={account} initialTheme={theme} notices={[]} />
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">{children}</main>
      </SidebarInset>
      <Toaster theme={theme} />
    </SidebarProvider>
  );
}
