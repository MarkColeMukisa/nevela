import { notFound } from "next/navigation";
import { UserForm } from "@/components/access/user-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { getUser, listRoles } from "@/lib/access";
import { requirePermission } from "@/lib/dashboard";

export const metadata = { title: "Edit user" };

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission("users.edit", `/dashboard/access/users/${id}`);
  const [user, roles] = await Promise.all([getUser(id), listRoles()]);
  if (!user) notFound();

  return (
    <>
      <PageHeader
        title={user.name || user.email}
        description={user.isSelf ? "This is your own account. Your name and picture are on your account page." : undefined}
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Users", href: "/dashboard/access/users" }, { label: user.name || user.email }]}
      />
      <UserForm user={user} roles={roles} />
    </>
  );
}
