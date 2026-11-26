import { ShieldBanIcon } from "lucide-react";
import { noIndex } from "@/lib/seo";

export const metadata = { title: "Blocked", robots: noIndex };

/**
 * Where a visitor is sent when the API turns their address away (Laravel's Security\Addresses):
 * after too many probes or requests, for a while, or by the people who run the app.
 */
export default function BlockedPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-surface">
        <ShieldBanIcon className="size-6 text-foreground-muted" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-semibold text-balance">Requests from your address are blocked</h1>
      <p className="text-foreground-muted text-pretty">
        Too many requests of the wrong kind came from it, or the people who run this app blocked it. A block made automatically ends by itself: try again later. If you
        think it&apos;s a mistake, ask them.
      </p>
    </main>
  );
}
