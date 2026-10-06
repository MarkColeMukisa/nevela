import Link from "next/link";
import { ArrowRightIcon, PlusIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { PageHeader } from "@/components/dashboard/page-header";
import { resourceIcon } from "@/components/dashboard/resource-icon";
import { StatCards, type Stat } from "@/components/dashboard/stat-card";
import { adminPermissions, allResources, resourcePath, resourceStats, trend, visibleResources } from "@/lib/dashboard";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Dashboard" };

/** The first thing you see when you sign in: how much data there is, and what's left to set up. */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { user } = await requireSession("/dashboard");
  const resources = await visibleResources();
  // Resources exist, and this person's roles show them none: not the same as an empty app.
  const noneForYou = resources.length === 0 && allResources().length > 0;
  const turnedBack = (await searchParams).error === "forbidden";

  const cards = await Promise.all(
    resources.map(async (resource) => {
      // One query per resource for the count and the trend, not two.
      const [stats, permissions] = await Promise.all([resourceStats(resource.name), adminPermissions(resource.name)]);
      return { resource, total: stats.total, recent: stats, permissions };
    }),
  );

  const stats: Stat[] = cards.slice(0, 4).map(({ resource, total, recent }) => ({
    label: resource.pluralLabel,
    value: total,
    hint: recent.current > 0 ? `${recent.current.toLocaleString()} this week` : "none this week",
    change: trend(recent.current, recent.previous),
    icon: resourceIcon(resource.icon),
    href: resourcePath(resource),
  }));

  return (
    <>
      <PageHeader
        title={`Welcome${user.name ? `, ${user.name.split(" ")[0]}` : ""}`}
        description={resources.length > 0 ? "Everything in your app, and how it's moving." : noneForYou ? "You're signed in." : "Your app is running. Add a resource to fill this page."}
      />

      {turnedBack && (
        <Alert>
          <AlertTitle>Your role doesn&apos;t include that page</AlertTitle>
          <AlertDescription>If you need it, ask an administrator to add it to your role.</AlertDescription>
        </Alert>
      )}

      <StatCards stats={stats} />

      {noneForYou && (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyTitle>Nothing to show yet</EmptyTitle>
            <EmptyDescription>
              Your role doesn&apos;t include any of this app&apos;s data. You can manage <Link href="/dashboard/account" className="underline">your account</Link>, and an
              administrator can give you access to more.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {resources.length === 0 && !noneForYou && (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No resources yet</EmptyTitle>
            <EmptyDescription>
              Generate one with <code>php artisan nevela:resource Contact --fields=&quot;name:string, email:email&quot;</code> in the Laravel app.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <div className="grid gap-6">
        {cards.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your data</CardTitle>
              <CardDescription>Every resource you can see.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col">
              {cards.map(({ resource, total, permissions }) => {
                const Icon = resourceIcon(resource.icon);
                return (
                  <div key={resource.name} className="flex items-center gap-3 border-b py-3 last:border-b-0 last:pb-0">
                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                      <Icon className="size-4.5" />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <Link href={resourcePath(resource)} className="truncate text-sm font-medium hover:underline">
                        {resource.pluralLabel}
                      </Link>
                      <span className="text-xs text-muted-foreground">{total.toLocaleString()} records</span>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      {permissions.create && (
                        <Button variant="ghost" size="icon" aria-label={`New ${resource.label.toLowerCase()}`} asChild>
                          <Link href={resourcePath(resource, "new")}>
                            <PlusIcon />
                          </Link>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" aria-label={`Open ${resource.pluralLabel.toLowerCase()}`} asChild>
                        <Link href={resourcePath(resource)}>
                          <ArrowRightIcon />
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

      </div>
    </>
  );
}
