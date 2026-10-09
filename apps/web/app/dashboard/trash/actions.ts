"use server";

import { revalidatePath } from "next/cache";
import { revalidateResource } from "@/lib/cache";
import { allResources, resourcePath } from "@/lib/dashboard";
import { laravel } from "@/lib/laravel";
import { getSession } from "@/lib/session";

/**
 * What can be done with a deleted record: bring it back, or remove it for good. Laravel
 * decides who may, by the resource's own policy, and its answer is passed back as it is.
 */

export type TrashResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

/** Both places a change shows: the trash it left or stayed in, and the list it came from. */
function revalidate(slug: string) {
  const resource = allResources().find((item) => item.slug === slug);
  if (resource) {
    try {
      revalidateResource({ resource: resource.name, action: "create", id: "" });
    } catch (error) {
      console.error(`[nevela] ${resource.name} trash cache invalidation failed:`, error);
    }
    revalidatePath(resourcePath(resource));
  }
  revalidatePath("/dashboard/trash");
}

async function send<T>(slug: string, path: string, method: "POST" | "DELETE"): Promise<TrashResult<T>> {
  if (!(await getSession())) return { ok: false, error: "Sign in to continue." };
  const response = await laravel(path, { method });
  if (!response.ok) {
    const body = (response.body ?? {}) as { error?: string };
    return { ok: false, error: body.error ?? `Something went wrong (${response.status}).` };
  }
  revalidate(slug);
  return { ok: true, data: response.body as T };
}

/** Back into its list, as it was. */
export async function restoreRecordAction(slug: string, id: string): Promise<TrashResult<{ id: string }>> {
  return send(slug, `_nevela/trash/${encodeURIComponent(slug)}/${encodeURIComponent(id)}/restore`, "POST");
}

/**
 * Several back at once: what "Undo" does after deleting a selection. Ids that were never
 * deleted (the ones the delete itself refused) aren't in the trash, and are passed over.
 */
export async function restoreManyAction(slug: string, ids: string[]): Promise<TrashResult<{ restored: number; refused: number; reason?: string }>> {
  if (!(await getSession())) return { ok: false, error: "Sign in to continue." };
  if (ids.length > 500) return { ok: false, error: "That's more than 500 records. Restore them from the trash instead." };
  let restored = 0;
  let refused = 0;
  let reason: string | undefined;
  for (const id of ids) {
    const response = await laravel(`_nevela/trash/${encodeURIComponent(slug)}/${encodeURIComponent(id)}/restore`, { method: "POST" });
    if (response.ok) restored++;
    else if (response.status !== 404) {
      refused++;
      reason ??= ((response.body ?? {}) as { error?: string }).error ?? `Something went wrong (${response.status}).`;
    }
  }
  if (restored > 0) revalidate(slug);
  if (restored === 0) return { ok: false, error: reason ?? "Nothing to restore: these aren't in the trash any more." };
  // Some came back and some were refused: both are said, so "Restored" is never the whole answer when it isn't.
  return { ok: true, data: { restored, refused, reason } };
}

/** Gone for good. */
export async function purgeRecordAction(slug: string, id: string): Promise<TrashResult> {
  return send(slug, `_nevela/trash/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`, "DELETE");
}

/** Everything of one resource that is in the trash, for good. */
export async function emptyTrashAction(slug: string): Promise<TrashResult<{ removed: number; kept: number }>> {
  return send(slug, `_nevela/trash/${encodeURIComponent(slug)}?confirm=${encodeURIComponent(slug)}`, "DELETE");
}
