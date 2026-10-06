import Link from "next/link";
import { PlusIcon, UsersIcon } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getCatalog, listRoles } from "@/lib/access";
import { requirePermission } from "@/lib/dashboard";

export const metadata = { title: "Roles" };

/** Each role: what it allows, out of everything there is, and how many people hold it. */
export default async function RolesPage() {
  const { may } = await requirePermission("roles.view", "/dashboard/access/roles");
  const [roles, catalog] = await Promise.all([listRoles(), getCatalog()]);

  return (
    <>
      <PageHeader
        title="Roles"
        description="A role is a set of permissions. Give someone a role on the Users screen, and they may do what it allows."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Roles" }]}
        actions={
          may("roles.create") && (
            <Button asChild>
              <Link href="/dashboard/access/roles/new">
                <PlusIcon />
                New role
              </Link>
            </Button>
          )
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((role) => {
          const share = catalog.total > 0 ? Math.round((role.permissions.length / catalog.total) * 100) : 0;
          return (
            <Card key={role.id} className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  <Link href={`/dashboard/access/roles/${encodeURIComponent(role.id)}`} className="hover:underline">
                    {role.name}
                  </Link>
                  {role.isSystem && <Badge variant="outline">Built in</Badge>}
                  {role.isAdmin && <Badge>Full access</Badge>}
                </CardTitle>
                <CardDescription>{role.description || "No description."}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Permissions</span>
                    <span className="tabular-nums">
                      {role.permissions.length} of {catalog.total}
                    </span>
                  </div>
                  <Progress value={share} aria-label={`${share}% of all permissions`} />
                </div>
                <div className="flex items-center justify-between">
                  <Link href={`/dashboard/access/users?role=${encodeURIComponent(role.id)}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                    <UsersIcon className="size-4" />
                    {role.users === 1 ? "1 user" : `${role.users.toLocaleString()} users`}
                  </Link>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/dashboard/access/roles/${encodeURIComponent(role.id)}`}>{may("roles.edit") && role.withinYours ? "Edit" : "View"}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
