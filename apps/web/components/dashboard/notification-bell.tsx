"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BellIcon, CircleAlertIcon, InfoIcon } from "lucide-react";
import { markReadAction } from "@/app/dashboard/notification-actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Condition, Inbox, Notification } from "@/lib/inbox";
import { cn } from "@/lib/utils";
import { RelativeTime } from "./local-time";

/** How often the bell asks again while the page is in view. */
const REFRESH_MS = 60 * 1000;

/**
 * The bell in the header: what happened behind the scenes, and, for an administrator,
 * what is wrong with the app right now.
 *
 * It starts with what the page was rendered with, then asks again every minute while the
 * tab is in view, whenever the tab comes back into view, and each time it is opened.
 * Opening a notification marks it read; "Mark all read" does the rest.
 */
export function NotificationBell({ initial }: { initial: Inbox }) {
  const [inbox, setInbox] = useState(initial);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      // Through the dashboard's own /api, which adds the session on the server.
      const response = await fetch("/api/_nevela/notifications", { cache: "no-store" });
      if (response.ok) setInbox((await response.json()) as Inbox);
    } catch {
      // Offline, or the API is down: keep what is shown.
    }
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  const markRead = (id?: string) => {
    setInbox((current) => ({
      ...current,
      items: current.items.map((item) => (id === undefined || item.id === id ? { ...item, read: true } : item)),
      unread: id === undefined ? 0 : Math.max(0, current.unread - (current.items.some((item) => item.id === id && !item.read) ? 1 : 0)),
    }));
    void markReadAction(id).then((result) => {
      if (!result.ok) void refresh();
    });
  };

  const { items, unread, conditions } = inbox;
  const urgent = conditions.some((condition) => condition.tone === "warning") || items.some((item) => !item.read && item.tone === "warning");
  const label = [unread > 0 ? `${unread} unread` : null, conditions.length > 0 ? `${conditions.length} to look at` : null].filter(Boolean).join(", ");

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void refresh();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label ? `Notifications: ${label}` : "Notifications"} className="relative">
          <BellIcon />
          {unread > 0 ? (
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] leading-none font-semibold tabular-nums ring-2 ring-background",
                urgent ? "bg-warning text-white" : "bg-primary text-primary-foreground",
              )}
            >
              {unread > 9 ? "9+" : unread}
            </span>
          ) : (
            conditions.length > 0 && (
              <span aria-hidden="true" className={cn("absolute top-1.5 right-1.5 size-2 rounded-full ring-2 ring-background", urgent ? "bg-warning" : "bg-primary")} />
            )
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={16} className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <span className="text-sm font-medium">Notifications</span>
          {unread > 0 && (
            <Button variant="ghost" size="xs" onClick={() => markRead()}>
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-[min(28rem,70vh)] overflow-y-auto">
          {conditions.length > 0 && (
            <ul className="border-b bg-muted/40">
              {conditions.map((condition) => (
                <ConditionRow key={condition.id} condition={condition} />
              ))}
            </ul>
          )}
          {items.length === 0 ? (
            conditions.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing needs you right now.</p>
          ) : (
            <ul>
              {items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  onOpen={() => {
                    if (!item.read) markRead(item.id);
                    if (item.url) setOpen(false);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({ item, onOpen }: { item: Notification; onOpen: () => void }) {
  const body = (
    <>
      <span className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", item.read ? "bg-transparent" : item.tone === "warning" ? "bg-warning" : "bg-primary")}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn("text-sm", item.read ? "text-muted-foreground" : "font-medium text-foreground")}>
            {item.title}
            {!item.read && <span className="sr-only"> (unread)</span>}
          </span>
          {item.body && <span className="line-clamp-2 text-xs text-muted-foreground">{item.body}</span>}
          <RelativeTime value={item.at} className="text-xs text-muted-foreground" />
        </span>
      </span>
    </>
  );
  const className = "block w-full px-4 py-3 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";

  return (
    <li className="border-b last:border-b-0">
      {item.url ? (
        <Link href={item.url} className={className} onClick={onOpen}>
          {body}
        </Link>
      ) : (
        <button type="button" className={cn(className, item.read && "cursor-default")} onClick={onOpen}>
          {body}
        </button>
      )}
    </li>
  );
}

function ConditionRow({ condition }: { condition: Condition }) {
  const Icon = condition.tone === "warning" ? CircleAlertIcon : InfoIcon;
  return (
    <li className="flex gap-2.5 border-b px-4 py-3 last:border-b-0">
      <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", condition.tone === "warning" ? "text-warning" : "text-primary")} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{condition.title}</span>
        <span className="text-xs text-muted-foreground">{condition.body}</span>
        {condition.url && (
          <a href={condition.url} target="_blank" rel="noreferrer" className="w-fit text-xs text-primary underline underline-offset-2 hover:no-underline">
            What changed
          </a>
        )}
      </span>
    </li>
  );
}
