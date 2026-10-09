import Link from "next/link";
import { LocalTime } from "@/components/dashboard/local-time";
import { PageHeader } from "@/components/dashboard/page-header";
import { resourceIcon } from "@/components/dashboard/resource-icon";
import { EmptyTrashButton, TimeLeft, TrashRowActions } from "@/components/dashboard/trash-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireDashboard } from "@/lib/dashboard";
import { trashBuckets, trashedRecords } from "@/lib/trash";
import { keptFor } from "@/lib/trash-info";
import { cn } from "@/lib/utils";

export const metadata = { title: "Trash" };

type Params = { in?: string; page?: string };

/**
 * Deleted records, by resource: restore one, or remove it for good.
 *
 * Whose trash a person sees is Laravel's to say, by each resource's own policy. Someone
 * who may delete products and nothing else sees deleted products and nothing else.
 */
export default async function TrashPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireDashboard("/dashboard/trash");
  const params = await searchParams;
  const trash = await trashBuckets();
  const buckets = trash?.resources ?? [];
  // The one asked for, or the first with something in it.
  const current = buckets.find((bucket) => bucket.slug === params.in) ?? buckets.find((bucket) => bucket.count > 0) ?? buckets[0];
  let list = current ? await trashedRecords(current.slug, params.page) : null;
  // The last record of the last page was just restored or removed: show the page before it.
  if (current && list && list.data.length === 0 && list.meta.total > 0) list = await trashedRecords(current.slug, String(list.meta.totalPages));
  const records = list?.data ?? [];
  const meta = list?.meta ?? { page: 1, perPage: 25, total: 0, totalPages: 1 };
  const href = (slug: string, page?: number) => `/dashboard/trash?${new URLSearchParams({ in: slug, ...(page && page > 1 ? { page: String(page) } : {}) })}`;

  return (
    <>
      <PageHeader
        title="Trash"
        description={
          trash
            ? `Deleted records are kept here ${keptFor(trash)}${trash.days === null ? "." : ", then removed for good."} Until then, they can be restored.`
            : "Deleted records, to restore or to remove for good."
        }
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Trash" }]}
        actions={current && meta.total > 0 && <EmptyTrashButton slug={current.slug} count={meta.total} noun={current.label.toLowerCase()} plural={current.pluralLabel.toLowerCase()} />}
      />

      {!trash ? (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyTitle>This app has no trash yet</EmptyTitle>
            <EmptyDescription>
              Its Laravel side is from before Nevela had one. Run <code>nevela upgrade</code>, then <code>nevela migrate</code>.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : buckets.length === 0 ? (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyTitle>Nothing here for you</EmptyTitle>
            <EmptyDescription>
              The trash holds what you may delete, once its table keeps deleted records. After an upgrade, <code>nevela migrate</code> is what gives each table
              its trash.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <nav aria-label="Deleted records, by resource" className="flex flex-wrap gap-2">
            {buckets.map((bucket) => {
              const Icon = resourceIcon(bucket.icon ?? undefined);
              const active = bucket.slug === current?.slug;
              return (
                <Button key={bucket.slug} variant={active ? "secondary" : "ghost"} size="sm" asChild>
                  <Link href={href(bucket.slug)} aria-current={active ? "page" : undefined} className={cn(!active && "text-muted-foreground")}>
                    <Icon data-icon="inline-start" />
                    {bucket.pluralLabel}
                    <Badge variant={bucket.count > 0 ? "default" : "outline"} className="tabular-nums">
                      {bucket.count.toLocaleString()}
                    </Badge>
                  </Link>
                </Button>
              );
            })}
          </nav>

          {current && records.length === 0 ? (
            <Empty className="rounded-xl border border-dashed">
              <EmptyHeader>
                <EmptyTitle>No deleted {current.pluralLabel.toLowerCase()}</EmptyTitle>
                <EmptyDescription>When one is deleted, it waits here until it is restored or its time runs out.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            current && (
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{current.label}</TableHead>
                      <TableHead>Deleted</TableHead>
                      <TableHead>Removed for good</TableHead>
                      <TableHead className="w-56">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="max-w-80 truncate font-medium">{record.label}</TableCell>
                        <TableCell className="text-sm text-muted-foreground tabular-nums">
                          <LocalTime value={record.deletedAt} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground tabular-nums">
                          <TimeLeft until={record.expiresAt} />
                        </TableCell>
                        <TableCell>
                          <TrashRowActions slug={current.slug} id={record.id} label={record.label} noun={current.label.toLowerCase()} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          )}

          {current && meta.total > 0 && (
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <p className="tabular-nums">
                {(meta.page - 1) * meta.perPage + 1}–{Math.min(meta.page * meta.perPage, meta.total)} of {meta.total.toLocaleString()} deleted{" "}
                {meta.total === 1 ? current.label.toLowerCase() : current.pluralLabel.toLowerCase()}
              </p>
              {meta.totalPages > 1 && (
                <div className="flex items-center gap-2">
                  {meta.page > 1 ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={href(current.slug, meta.page - 1)}>Previous</Link>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled>
                      Previous
                    </Button>
                  )}
                  {meta.page < meta.totalPages ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={href(current.slug, meta.page + 1)}>Next</Link>
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
      )}
    </>
  );
}
