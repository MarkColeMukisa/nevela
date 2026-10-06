import Link from "next/link";
import { PlusIcon, ShieldCheckIcon } from "lucide-react";
import { UserRowActions } from "@/components/access/user-row-actions";
import { UsersToolbar } from "@/components/access/users-toolbar";
import { LocalTime } from "@/components/dashboard/local-time";
import { PageHeader } from "@/components/dashboard/page-header";
import { UserAvatar } from "@/components/dashboard/user-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listRoles, listUsers } from "@/lib/access";
import { requirePermission } from "@/lib/dashboard";

export const metadata = { title: "Users" };

type Params = { q?: string; role?: string; status?: string; page?: string };

/** Everyone who can sign in: who they are, what roles they hold, and whether they still can. */
export default async function UsersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { may } = await requirePermission("users.view", "/dashboard/access/users");
  const params = await searchParams;
  const [list, roles] = await Promise.all([listUsers(params), listRoles()]);
  const users = list?.data ?? [];
  const meta = list?.meta ?? { page: 1, perPage: 25, total: 0, totalPages: 1 };
  const filtered = Boolean(params.q || params.role || params.status);

  const pageHref = (page: number) => {
    const query = new URLSearchParams(Object.entries({ ...params, page: String(page) }).filter(([, value]) => value) as [string, string][]);
    return `/dashboard/access/users?${query}`;
  };

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone who can sign in, and the roles that say what they may do."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Users" }]}
        actions={
          may("users.create") && (
            <Button asChild>
              <Link href="/dashboard/access/users/new">
                <PlusIcon />
                Add user
              </Link>
            </Button>
          )
        }
      />

      <UsersToolbar roles={roles.map(({ id, name }) => ({ id, name }))} />

      {users.length === 0 ? (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyTitle>{filtered ? "Nobody matches" : "No users"}</EmptyTitle>
            <EmptyDescription>{filtered ? "Try a different search, role or status." : "Add the first person who should be able to sign in."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} className={user.active ? undefined : "text-muted-foreground"}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <UserAvatar user={{ name: user.name, email: user.email, image: user.image }} className="size-8" />
                      <div className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-2 truncate text-sm font-medium">
                          {may("users.edit") && (user.withinYours || user.isSelf) ? (
                            <Link href={`/dashboard/access/users/${encodeURIComponent(user.id)}`} className="truncate hover:underline">
                              {user.name || user.email}
                            </Link>
                          ) : (
                            <span className="truncate">{user.name || user.email}</span>
                          )}
                          {user.isSelf && <Badge variant="outline">You</Badge>}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.length === 0 && <span className="text-sm text-muted-foreground">None</span>}
                      {user.roles.map((role) => (
                        <Badge key={role.id} variant={user.isAdmin && role.name === "ADMIN" ? "default" : "secondary"}>
                          {role.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant={user.active ? "outline" : "secondary"}>{user.active ? "Active" : "Switched off"}</Badge>
                      {user.twoFactorEnabled && (
                        <Badge variant="outline" title="Signs in with a second step">
                          <ShieldCheckIcon />
                          2-step
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{user.lastActiveAt ? <LocalTime value={user.lastActiveAt} /> : "Not yet"}</TableCell>
                  <TableCell>
                    <UserRowActions user={user} canEdit={may("users.edit") && (user.withinYours || user.isSelf)} canDelete={may("users.delete") && user.withinYours} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {meta.total > 0 && (
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <p className="tabular-nums">
            {(meta.page - 1) * meta.perPage + 1}–{Math.min(meta.page * meta.perPage, meta.total)} of {meta.total.toLocaleString()} {meta.total === 1 ? "user" : "users"}
          </p>
          {meta.totalPages > 1 && (
            <div className="flex items-center gap-2">
              {meta.page > 1 ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={pageHref(meta.page - 1)}>Previous</Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  Previous
                </Button>
              )}
              {meta.page < meta.totalPages ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={pageHref(meta.page + 1)}>Next</Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  Next
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
