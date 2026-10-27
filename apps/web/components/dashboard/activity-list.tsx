import Link from "next/link";
import { ArchiveRestoreIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { describe, type ActivityAction, type ActivityEntry } from "@/lib/activity";
import { cn } from "@/lib/utils";
import { RelativeTime } from "./local-time";

const ICONS: Record<ActivityAction, typeof PlusIcon> = {
  created: PlusIcon,
  updated: PencilIcon,
  deleted: Trash2Icon,
  restored: ArchiveRestoreIcon,
  purged: XIcon,
};

const TONES: Record<ActivityAction, string> = {
  created: "bg-success/10 text-success",
  updated: "bg-muted text-muted-foreground",
  deleted: "bg-warning/10 text-warning",
  restored: "bg-primary/10 text-primary",
  purged: "bg-destructive/10 text-destructive",
};

/** Who did what, newest first: the dashboard's Recent activity and the Activity page. */
export function ActivityList({ entries, you }: { entries: ActivityEntry[]; you?: string }) {
  return (
    <ul className="flex flex-col">
      {entries.map((entry) => {
        const Icon = ICONS[entry.action];
        const who = entry.user === null ? "Someone" : entry.user.id === you ? "You" : (entry.user.name ?? "A removed account");
        const what = describe(entry);
        return (
          <li key={entry.id} className="flex items-start gap-3 border-b py-3 first:pt-0 last:border-b-0 last:pb-0">
            <span aria-hidden="true" className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", TONES[entry.action])}>
              <Icon className="size-3.5" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm">
                <span className="font-medium">{who}</span>{" "}
                {entry.url ? (
                  <Link href={entry.url} className="hover:underline">
                    {what}
                  </Link>
                ) : (
                  what
                )}
              </span>
              <RelativeTime value={entry.at} className="text-xs text-muted-foreground" />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
