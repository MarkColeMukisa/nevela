import { BlockAddressForm, UnblockButton } from "@/components/access/blocked-address-actions";
import { LocalTime } from "@/components/dashboard/local-time";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listBlockedAddresses, listSecurityEvents } from "@/lib/access";
import { dashboardSession, requirePermission } from "@/lib/dashboard";

export const metadata = { title: "Blocked addresses" };

const WHY: Record<string, string> = { scanner: "Probing for files", limit: "Too many requests", "sign-in": "Trying many accounts", manual: "Blocked by hand" };

/** The security log's kinds, as the page says them. */
const KIND: Record<string, string> = {
  scanner: "Probe",
  limit: "Over the limit",
  "sign-in": "Tried many accounts",
  locked: "Sign-in locked",
  refused: "Turned away (blocked)",
  blocked: "Blocked",
  unblocked: "Cleared",
};

/**
 * The addresses turned away (Laravel's Security\Addresses): blocked for a while for too many
 * strikes, or by someone here. Each is cleared from here, or with `php nevela security unblock`.
 */
export default async function BlockedAddressesPage() {
  await requirePermission("blocked_addresses.view", "/dashboard/access/blocked");
  const { may } = await dashboardSession();
  const list = await listBlockedAddresses();
  const blocks = list && list !== "migrate" ? list.data : [];
  const log = await listSecurityEvents();
  const events = Array.isArray(log) ? log : [];

  return (
    <>
      <PageHeader
        title="Blocked addresses"
        description="Addresses turned away before they reach the app: for a while after too many probes or requests, or until cleared when blocked by hand."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Blocked addresses" }]}
      />

      {list === "migrate" ? (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyTitle>The block list isn&apos;t set up yet</EmptyTitle>
            <EmptyDescription>
              Run <code>nevela migrate</code>, and from then on addresses that keep probing are blocked for a while, and can be blocked here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {may("blocked_addresses.create") ? <BlockAddressForm /> : null}

          {blocks.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No address is blocked.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Address</TableHead>
                    <TableHead>Why</TableHead>
                    <TableHead>Until</TableHead>
                    <TableHead className="w-32">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blocks.map((block) => (
                    <TableRow key={block.id}>
                      <TableCell className="font-mono text-sm">{block.address}</TableCell>
                      <TableCell className="text-sm">
                        <div className="flex flex-col gap-1">
                          <Badge variant={block.reason === "manual" ? "secondary" : "outline"} className="w-fit">
                            {WHY[block.reason] ?? block.reason}
                          </Badge>
                          {block.note ? <span className="text-xs text-muted-foreground">{block.note}</span> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{block.until ? <LocalTime value={block.until} /> : "Until cleared"}</TableCell>
                      <TableCell className="text-right">{may("blocked_addresses.delete") ? <UnblockButton id={block.id} address={block.address} /> : null}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {list && list.exempt.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Never blocked: this server, and {list.exempt.join(", ")} (<code>NEVELA_EXEMPT</code>).
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              To keep an office or a monitor from ever being blocked, list it in <code>NEVELA_EXEMPT</code>. Locked out yourself? <code>php nevela security unblock &lt;address&gt;</code> on the server.
            </p>
          )}

          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-base font-semibold">Turned away</h2>
              <p className="text-sm text-muted-foreground">The last week, by address and hour: probes, requests over the limit, sign-ins locked, and blocks made and cleared.</p>
            </div>
            {log === "migrate" ? (
              <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                Run <code>nevela migrate</code> to keep a log of what is turned away.
              </p>
            ) : events.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Nothing turned away this week.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Address</TableHead>
                      <TableHead>What</TableHead>
                      <TableHead className="text-right">Times</TableHead>
                      <TableHead>Latest</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="font-mono text-sm">{event.address}</TableCell>
                        <TableCell className="text-sm">
                          <div className="flex flex-col gap-1">
                            <Badge variant={event.kind === "blocked" ? "destructive" : "outline"} className="w-fit">
                              {KIND[event.kind] ?? event.kind}
                            </Badge>
                            {event.detail ? <span className="text-xs text-muted-foreground">{event.detail}</span> : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{event.count.toLocaleString()}</TableCell>
                        <TableCell className="max-w-64 truncate font-mono text-xs text-muted-foreground" title={event.userAgent ?? undefined}>
                          {event.path ? `${event.method ?? ""} ${event.path}`.trim() : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <LocalTime value={event.lastAt} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
