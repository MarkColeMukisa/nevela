import { laravel } from "./laravel";

/**
 * The activity log, as Laravel serves it (`/_nevela/activity`): who created, changed,
 * deleted or restored which records. The same thing done to many records by one person
 * within a couple of minutes is one entry with a count.
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
  count: number;
  /** The record's title, when the entry is one record. */
  title: string | null;
  recordId: string | null;
  /** Where to see it: the record, the trash, the list, or nowhere once removed for good. */
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

/** A page of it. Null when the person may not see it, or the API is from before there was one. */
export async function loadActivity(params: { resource?: string; action?: string; page?: string; perPage?: number } = {}): Promise<ActivityPage | null> {
  const query = new URLSearchParams();
  if (params.resource) query.set("resource", params.resource);
  if (params.action) query.set("action", params.action);
  if (params.page && Number(params.page) > 1) query.set("page", params.page);
  if (params.perPage) query.set("perPage", String(params.perPage));
  try {
    const response = await laravel(`_nevela/activity${query.size ? `?${query}` : ""}`);
    return response.ok ? (response.body as ActivityPage) : null;
  } catch {
    return null;
  }
}
