import Link from "next/link";
import { ActivityList } from "@/components/dashboard/activity-list";
import { PageHeader } from "@/components/dashboard/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ACTION_WORDS, loadActivity, type ActivityAction } from "@/lib/activity";
import { requirePermission, visibleResources } from "@/lib/dashboard";
import { cn } from "@/lib/utils";

export const metadata = { title: "Activity" };

type Params = { resource?: string; action?: string; page?: string };

const ACTIONS = Object.keys(ACTION_WORDS) as ActivityAction[];

/**
 * Who created, changed, deleted or restored which records, newest first. For those whose
 * roles include `activity.view`, and only on the resources they may see.
 */
export default async function ActivityPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { session } = await requirePermission("activity.view", "/dashboard/activity");
  const params = await searchParams;
  const resources = await visibleResources();
  const resource = resources.find((item) => item.name === params.resource)?.name;
  const action = ACTIONS.find((item) => item === params.action);
  const result = await loadActivity({ resource, action, page: params.page });
  const activity = result.status === "ok" ? result.page : null;
  const meta = activity?.meta ?? { page: 1, perPage: 25, total: 0, totalPages: 0 };
  const href = (over: Partial<Params>) => {
    const next = { resource, action, ...over };
    const query = new URLSearchParams(Object.entries(next).filter((entry): entry is [string, string] => Boolean(entry[1])));
    return `/dashboard/activity${query.size ? `?${query}` : ""}`;
  };
  const chip = (active: boolean, label: string, to: string) => (
    <Button key={to} variant={active ? "secondary" : "ghost"} size="sm" asChild>
      <Link href={to} aria-current={active ? "page" : undefined} className={cn(!active && "text-muted-foreground")}>
        {label}
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Activity"
        description="Who created, changed, deleted and restored records. The same thing done to many at once is one line."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Activity" }]}
      />

      <div className="flex flex-col gap-2">
        <nav aria-label="By resource" className="flex flex-wrap gap-1">
          {chip(!resource, "Everything", href({ resource: undefined, page: undefined }))}
          {resources.map((item) => chip(item.name === resource, item.pluralLabel, href({ resource: item.name, page: undefined })))}
        </nav>
        <nav aria-label="By what was done" className="flex flex-wrap gap-1">
          {chip(!action, "Any change", href({ action: undefined, page: undefined }))}
          {ACTIONS.map((item) => chip(item === action, ACTION_WORDS[item][0].toUpperCase() + ACTION_WORDS[item].slice(1), href({ action: item, page: undefined })))}
        </nav>
      </div>

      {result.status === "missing" ? (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No activity log yet</EmptyTitle>
            <EmptyDescription>
              Nothing is kept until it has its table. Run <code>nevela upgrade</code>, then <code>nevela migrate</code>.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : result.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>The activity log couldn&apos;t be loaded</AlertTitle>
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      ) : !activity || activity.data.length === 0 ? (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyTitle>Nothing yet</EmptyTitle>
            <EmptyDescription>When someone creates, changes or deletes a record, it is listed here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card>
          <CardContent>
            <ActivityList entries={activity.data} you={session.user.id} />
          </CardContent>
        </Card>
      )}

      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <p className="tabular-nums">
            Page {meta.page} of {meta.totalPages}
          </p>
          <div className="flex items-center gap-2">
            {meta.page > 1 && (
              <Button variant="outline" size="sm" asChild>
                <Link href={href({ page: String(meta.page - 1) })}>Newer</Link>
              </Button>
            )}
            {meta.page < meta.totalPages && (
              <Button variant="outline" size="sm" asChild>
                <Link href={href({ page: String(meta.page + 1) })}>Older</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
