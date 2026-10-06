import { notFound } from "next/navigation";
import { RoleForm } from "@/components/access/role-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { getCatalog, getRole } from "@/lib/access";
import { requirePermission } from "@/lib/dashboard";

export const metadata = { title: "Role" };

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, may } = await requirePermission("roles.view", `/dashboard/access/roles/${id}`);
  const [role, catalog] = await Promise.all([getRole(id), getCatalog()]);
  if (!role) notFound();
  const { user } = session;

  return (
    <>
      <PageHeader
        title={role.name}
        description={role.users === 1 ? "One person holds this role." : `${role.users.toLocaleString()} people hold this role.`}
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Roles", href: "/dashboard/access/roles" }, { label: role.name }]}
      />
      <RoleForm
        role={role}
        catalog={catalog}
        mine={user.isAdmin || user.permissions === undefined ? null : user.permissions}
        canEdit={may("roles.edit")}
        canDelete={may("roles.delete")}
      />
    </>
  );
}
