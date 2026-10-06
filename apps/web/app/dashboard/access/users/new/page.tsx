import { UserForm } from "@/components/access/user-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { listRoles } from "@/lib/access";
import { requirePermission } from "@/lib/dashboard";

export const metadata = { title: "Add user" };

export default async function NewUserPage() {
  await requirePermission("users.create", "/dashboard/access/users/new");

  return (
    <>
      <PageHeader title="Add user" crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Users", href: "/dashboard/access/users" }, { label: "Add" }]} />
      <UserForm roles={await listRoles()} />
    </>
  );
}
