import { cache } from "react";
import { laravel } from "./laravel";
import type { TrashInfo } from "./trash-info";

/**
 * The trash, as Laravel serves it (`/_nevela/trash`).
 *
 * A deleted record is kept, hidden, and can be restored for a number of days. Which
 * resources have a trash is Laravel's to say: one whose table hasn't been migrated yet
 * still deletes for good, and so does every resource of an app whose API is from before
 * the trash existed.
 */

export interface TrashBucket {
  name: string;
  label: string;
  pluralLabel: string;
  slug: string;
  icon: string | null;
  /** How many of this resource's records are in the trash. */
  count: number;
}

export interface TrashedRecord {
  id: string;
  /** What a list would call it: its title. */
  label: string;
  deletedAt: string | null;
  /** When it is removed for good, or null when it is kept until someone removes it. */
  expiresAt: string | null;
}

export interface TrashList {
  data: TrashedRecord[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

/**
 * Which resources have a trash this person may use. Asked once for a page, however many
 * delete buttons are on it; nothing is counted. Null when the API has no trash at all.
 */
const trashStatus = cache(async (): Promise<{ days: number | null; resources: string[] } | null> => {
  const response = await laravel("_nevela/trash/_status");
  return response.ok ? (response.body as { days: number | null; resources: string[] }) : null;
});

/** For a resource's delete buttons: its trash, or undefined when deleting it is for good. */
export async function trashFor(slug: string): Promise<TrashInfo | undefined> {
  const status = await trashStatus();
  return status?.resources.includes(slug) ? { days: status.days } : undefined;
}

/**
 * Everything in the trash, by resource, for the Trash page. Opening it is also what
 * removes anything past its time, where no scheduler does that overnight.
 */
export async function trashBuckets(): Promise<{ days: number | null; resources: TrashBucket[] } | null> {
  const response = await laravel("_nevela/trash");
  return response.ok ? (response.body as { days: number | null; resources: TrashBucket[] }) : null;
}

export async function trashedRecords(slug: string, page?: string): Promise<TrashList | null> {
  const query = new URLSearchParams(page ? { page } : {});
  const response = await laravel(`_nevela/trash/${encodeURIComponent(slug)}?${query}`);
  return response.ok ? (response.body as TrashList) : null;
}
