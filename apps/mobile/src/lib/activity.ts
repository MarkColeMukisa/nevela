/**
 * The activity log and the trash, as the screens read them: what the API sends for
 * `_nevela/activity` and `_nevela/trash`, and the plain words for them. Kept free of anything
 * that needs the app running, so it can be tested on its own.
 */

export type ActivityAction = "created" | "updated" | "deleted" | "restored" | "purged";

/** One line of the log: who did what to which record or records, and when. */
export interface Activity {
  id: string;
  action: ActivityAction;
  label: string;
  pluralLabel?: string;
  slug: string;
  count: number;
  title: string | null;
  recordId: string | null;
  user: { id: string; name: string | null } | null;
  at: string;
}

export const ACTION_VERBS: Record<ActivityAction, string> = {
  created: "added",
  updated: "changed",
  deleted: "deleted",
  restored: "restored",
  purged: "removed for good",
};

/** What the filter chips are called, in the order they are shown. */
export const ACTION_FILTERS: { value: ActivityAction | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "created", label: "Added" },
  { value: "updated", label: "Changed" },
  { value: "deleted", label: "Deleted" },
  { value: "restored", label: "Restored" },
  { value: "purged", label: "Removed" },
];

/** The two halves of "Ada changed Quiet Lamp": who, and what. */
export function describe(entry: Activity, you: string): { who: string; what: string } {
  const who = entry.user ? (entry.user.id === you ? "You" : (entry.user.name ?? "Someone")) : "Someone";
  const plural = entry.pluralLabel ?? `${entry.label}s`;
  const what = entry.count > 1 ? `${entry.count} ${plural.toLowerCase()}` : (entry.title ?? `${/^[aeiou]/i.test(entry.label) ? "an" : "a"} ${entry.label.toLowerCase()}`);
  return { who, what };
}

/** Whether a line leads to a record that is still there. */
export function opensRecord(entry: Activity): boolean {
  return Boolean(entry.recordId) && entry.count === 1 && entry.action !== "deleted" && entry.action !== "purged";
}

/** A resource that has a trash, with how much is in it. */
export interface TrashResource {
  name: string;
  label: string;
  pluralLabel: string;
  slug: string;
  icon: string | null;
  count: number;
}

/** One deleted record. */
export interface TrashRecord {
  id: string;
  label: string;
  deletedAt: string | null;
  expiresAt: string | null;
}

/** How long a deleted record has left, in words: "5 days left", "Today", or "Going soon". */
export function timeLeft(expiresAt: string | null, now: number = Date.now()): string {
  if (!expiresAt) return "Kept until you remove it";
  const at = Date.parse(expiresAt);
  if (Number.isNaN(at)) return "";
  const days = Math.ceil((at - now) / 86_400_000);
  if (days <= 0) return "Going soon";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

/** How long the trash keeps things, said once: "30 days", or that it keeps them for good. */
export function keepsFor(days: number | null | undefined): string {
  if (!days || days <= 0) return "Deleted records are kept until someone removes them.";
  return days === 1 ? "Deleted records are kept for a day, then removed for good." : `Deleted records are kept for ${days} days, then removed for good.`;
}
