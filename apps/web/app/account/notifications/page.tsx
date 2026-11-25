import Link from "next/link";
import { markReadAction } from "@/app/account/actions";
import { onSite } from "@/lib/app";
import { loadInbox } from "@/lib/notifications";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Notifications" };

/**
 * What the customer has been told: the same notices the phone's bell shows. Each leads to
 * where it is about on the site (lib/app.ts, onSite), whatever address Laravel stored.
 */
export default async function NotificationsPage() {
  await requireSession("/account/notifications");
  const inbox = await loadInbox();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Notifications</h2>
        {inbox.unread > 0 ? (
          <form action={markReadAction.bind(null, undefined)}>
            <button type="submit" className="text-sm font-medium text-link hover:underline">
              Mark all as read
            </button>
          </form>
        ) : null}
      </div>
      {inbox.items.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Nothing yet. When something needs you to know about it, it is here.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border">
          {inbox.items.map((item) => {
            const body = (
              <>
                <span className="flex items-center gap-2 text-sm font-medium">
                  {!item.read ? <span className="size-2 rounded-full bg-primary" aria-label="Unread" /> : null}
                  {item.title}
                  {item.count > 1 ? <span className="text-muted-foreground">({item.count})</span> : null}
                </span>
                {item.body ? <span className="text-sm text-muted-foreground">{item.body}</span> : null}
                <time dateTime={item.at} className="text-xs text-muted-foreground">
                  {new Date(item.at).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}
                </time>
              </>
            );
            return (
              <li key={item.id} className="flex items-start justify-between gap-4 px-4 py-3">
                {item.url ? (
                  <Link href={onSite(item.url)} className="flex flex-col gap-1 hover:underline">
                    {body}
                  </Link>
                ) : (
                  <div className="flex flex-col gap-1">{body}</div>
                )}
                {!item.read ? (
                  <form action={markReadAction.bind(null, item.id)}>
                    <button type="submit" className="text-xs text-muted-foreground hover:text-foreground">
                      Mark read
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
