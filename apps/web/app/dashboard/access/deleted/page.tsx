import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { AllowEmailButton, DeletedAccountActions } from "@/components/access/deleted-account-actions";
import { LocalTime } from "@/components/dashboard/local-time";
import { PageHeader } from "@/components/dashboard/page-header";
import { UserAvatar } from "@/components/dashboard/user-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listBlockedEmails, listDeletedAccounts } from "@/lib/access";
import { requirePermission } from "@/lib/dashboard";

export const metadata = { title: "Deleted accounts" };

type Params = { q?: string; page?: string };

/**
 * Accounts that were closed: by their owners, or by someone deleting them from the Users
 * screen. Each is kept as it was, so it can be restored, or removed for good. Below them,
 * the emails whose accounts were removed for good, which can't sign up again.
 */
export default async function DeletedAccountsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requirePermission("users.delete", "/dashboard/access/deleted");
  const params = await searchParams;
  const list = await listDeletedAccounts(params);
  const ready = list !== null && list !== "migrate";
  const accounts = ready ? list.data : [];
  const meta = ready ? list.meta : { page: 1, perPage: 25, total: 0, totalPages: 1 };
  const blocked = ready && list.blocked > 0 ? await listBlockedEmails() : [];

  const pageHref = (page: number) => `/dashboard/access/deleted?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), page: String(page) })}`;

  return (
    <>
      <PageHeader
        title="Deleted accounts"
        description="Accounts that were closed. They can't sign in, and their email can't sign up again. Restore one as it was, or remove it for good."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Deleted accounts" }]}
      />

      {list === "migrate" ? (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyTitle>This app doesn&apos;t keep deleted accounts yet</EmptyTitle>
            <EmptyDescription>
              Deleting a user still removes them. Run <code>nevela upgrade</code>, then <code>nevela migrate</code>, and from then on a deleted account is
              kept here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {(meta.total > 0 || params.q) && (
            <form className="relative w-full max-w-sm" role="search">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input type="search" name="q" defaultValue={params.q ?? ""} placeholder="Search by name or email" aria-label="Search deleted accounts" className="pl-8" />
            </form>
          )}

          {accounts.length === 0 && blocked.length > 0 && !params.q ? (
            // With blocked emails to show below, a line is enough: the tall empty box would push them off the screen.
            <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No deleted accounts at the moment.</p>
          ) : accounts.length === 0 ? (
            <Empty className="rounded-xl border border-dashed">
              <EmptyHeader>
                <EmptyTitle>{params.q ? "Nobody matches" : "No deleted accounts"}</EmptyTitle>
                <EmptyDescription>
                  {params.q ? "Try a different name or email." : "When someone closes their account, or you delete a user, the account waits here."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Closed</TableHead>
                    <TableHead className="w-64">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <UserAvatar user={{ name: account.name, email: account.email, image: account.image }} className="size-8" />
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate text-sm font-medium">{account.name || account.email}</span>
                            <span className="truncate text-xs text-muted-foreground">{account.email}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {account.roles.length === 0 && <span className="text-sm text-muted-foreground">None</span>}
                          {account.roles.map((role) => (
                            <Badge key={role.id} variant="secondary">
                              {role.name}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div className="flex flex-col">
                          <LocalTime value={account.closedAt} />
                          <span className="text-xs">
                            {account.closedBy === "self" ? "by themselves" : account.closedByName ? `by ${account.closedByName}` : account.closedBy === "admin" ? "by an administrator" : ""}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {/* Only accounts that may do no more than you: the rule the Users screen has. */}
                        {account.withinYours && <DeletedAccountActions id={account.id} who={account.name || account.email} email={account.email} />}
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
                {(meta.page - 1) * meta.perPage + 1}–{Math.min(meta.page * meta.perPage, meta.total)} of {meta.total.toLocaleString()} deleted{" "}
                {meta.total === 1 ? "account" : "accounts"}
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

          {blocked.length > 0 && (
            <section aria-labelledby="blocked-emails" className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h2 id="blocked-emails" className="text-lg font-semibold tracking-tight">
                  Emails that can&apos;t sign up
                </h2>
                <p className="text-sm text-muted-foreground">
                  Their accounts were removed for good. Only a fingerprint of each address is kept: enough to refuse it, not to read it back.
                </p>
              </div>
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Blocked</TableHead>
                      <TableHead className="w-36">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blocked.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono text-sm">{entry.hint}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <LocalTime value={entry.blockedAt} />
                        </TableCell>
                        <TableCell className="text-right">
                          <AllowEmailButton id={entry.id} hint={entry.hint} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
