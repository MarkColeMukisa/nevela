import { laravel } from "./laravel";

/**
 * The activity log, as Laravel serves it (`/_nevela/activity`): who created, changed,
 * deleted or restored which records. The same thing done by one person within a couple of
 * minutes is one entry with a count.
 *
 * For those whose roles include `activity.view`, and only on the resources they may view.
 */
export type ActivityAction = "created" | "updated" | "deleted" | "restored" | "purged";

export interface ActivityEntry {
  id: string;
  action: ActivityAction;
  /** The resource's name, and what to call one and several of it. */
  resource: string;
  label: string;
  pluralLabel: string;
  slug: string;
  /** How many times it was done: records, or the same record more than once. */
  count: number;
  /** The record's title, when the entry is one record. */
  title: string | null;
  recordId: string | null;
  /** Where to look: the record, the trash, the list, or nowhere once removed for good. */
  url: string | null;
  /** Who did it. Null name: their account has since been removed. */
  user: { id: string; name: string | null } | null;
  /** The last of it, ISO 8601. */
  at: string;
  startedAt: string;
}

export interface ActivityPage {
  data: ActivityEntry[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

/**
 * What asking for it came to: a page, or why there is none. "missing" is an app to upgrade
 * or migrate; "error" is something an upgrade wouldn't fix.
 */
export type ActivityResult = { status: "ok"; page: ActivityPage } | { status: "missing" } | { status: "error"; message: string };

export const ACTION_WORDS: Record<ActivityAction, string> = {
  created: "created",
  updated: "changed",
  deleted: "deleted",
  restored: "restored",
  purged: "removed for good",
};

/** "created 20 products", "deleted a product: Lamp". */
export function describe(entry: ActivityEntry): string {
  const verb = ACTION_WORDS[entry.action];
  if (entry.count > 1) return `${verb} ${entry.count.toLocaleString()} ${entry.pluralLabel.toLowerCase()}`;
  const noun = entry.label.toLowerCase();
  return `${verb} ${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}${entry.title ? `: ${entry.title}` : ""}`;
}

export async function loadActivity(params: { resource?: string; action?: string; page?: string; perPage?: number } = {}): Promise<ActivityResult> {
  const query = new URLSearchParams();
  if (params.resource) query.set("resource", params.resource);
  if (params.action) query.set("action", params.action);
  if (params.page && Number(params.page) > 1) query.set("page", params.page);
  if (params.perPage) query.set("perPage", String(params.perPage));
  try {
    const response = await laravel(`_nevela/activity${query.size ? `?${query}` : ""}`);
    if (response.ok) return { status: "ok", page: response.body as ActivityPage };
    // No such route (an API from before the log), or its table not migrated yet.
    const code = (response.body as { code?: string } | null)?.code;
    if (response.status === 404 || code === "MIGRATION_NEEDED") return { status: "missing" };
    return { status: "error", message: (response.body as { error?: string } | null)?.error ?? `Laravel answered ${response.status}.` };
  } catch {
    return { status: "error", message: "Can't reach the API. Is the Laravel app running?" };
  }
}
