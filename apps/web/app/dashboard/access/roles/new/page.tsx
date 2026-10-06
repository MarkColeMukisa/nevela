import { RoleForm } from "@/components/access/role-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { getCatalog } from "@/lib/access";
import { requirePermission } from "@/lib/dashboard";

export const metadata = { title: "New role" };

export default async function NewRolePage() {
  const { session } = await requirePermission("roles.create", "/dashboard/access/roles/new");
  const { user } = session;

  return (
    <>
      <PageHeader title="New role" crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Roles", href: "/dashboard/access/roles" }, { label: "New" }]} />
      <RoleForm catalog={await getCatalog()} mine={user.isAdmin || user.permissions === undefined ? null : user.permissions} canEdit canDelete={false} />
    </>
  );
}
