"use server";

import { revalidatePath } from "next/cache";
import { can, storedFields, type PolicyAction } from "@flaredev/core";
import type { FieldIssue } from "@/lib/resource/store";
import { toCsv } from "@/lib/csv";
import { resourcePath, dashboardSession, dashboardStore, policyFor } from "@/lib/dashboard";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; issues?: FieldIssue[]; field?: string };

const forbidden = (message = "You don't have access to this."): ActionResult<never> => ({ ok: false, status: 403, error: message });

/**
 * Session check, plus the display policy when the resource has one. Laravel's policy
 * is the real decision and answers 403 itself; this only saves a round trip.
 */
async function allowed(resourceName: string, action: PolicyAction): Promise<ActionResult<never> | undefined> {
  const { allowed: inAdmin, role } = await dashboardSession();
  if (!inAdmin) return forbidden();
  if (!can(policyFor(resourceName), role, action)) return forbidden(`Your role can't ${action} this record.`);
}

export async function deleteRecordAction(resourceName: string, id: string): Promise<ActionResult<{ id: string }>> {
  const denied = await allowed(resourceName, "delete");
  if (denied) return denied;

  const store = dashboardStore(resourceName);
  const result = await store.delete(id);
  if (result.ok) revalidatePath(resourcePath(store.resource));
  return result;
}

/** How many rows one export may fetch: enough for a spreadsheet. */
const EXPORT_LIMIT = 50_000;
/** Laravel's `nevela.max_per_page`. */
const EXPORT_PAGE = 100;

export async function deleteManyAction(resourceName: string, ids: string[]): Promise<ActionResult<{ deleted: number; failed: number }>> {
  const denied = await allowed(resourceName, "delete");
  if (denied) return denied;
  if (ids.length === 0) return { ok: true, data: { deleted: 0, failed: 0 } };
  if (ids.length > 500) return { ok: false, status: 400, error: "That's more than 500 records. Delete them in smaller batches." };

  const store = dashboardStore(resourceName);
  // One at a time: each delete runs Laravel's policy, and a row that refuses to go
  // shouldn't take the rest of the batch with it.
  let deleted = 0;
  let failed = 0;
  for (const id of ids) {
    const result = await store.delete(id);
    if (result.ok) deleted++;
    else failed++;
  }
  if (deleted > 0) revalidatePath(resourcePath(store.resource));
  return { ok: true, data: { deleted, failed } };
}

/**
 * Every record matching the current search and filters, as CSV.
 *
 * Read through the same store the table uses, so the export shows exactly what the
 * person can see — their policy, their filters, their sort.
 */
export async function exportRecordsAction(resourceName: string, query: string): Promise<ActionResult<{ csv: string; rows: number; truncated: boolean }>> {
  const denied = await allowed(resourceName, "read");
  if (denied) return denied;

  const store = dashboardStore(resourceName);
  const fields = storedFields(store.resource).filter(([, def]) => def.kind !== "file");
  const columns = [["id", "Id"] as const, ...fields.map(([key, def]) => [key, def.label] as const), ["createdAt", "Created"] as const];

  const rows: Record<string, unknown>[] = [];
  let truncated = false;
  for (let page = 1; rows.length < EXPORT_LIMIT; page++) {
    const params = new URLSearchParams(query);
    params.set("page", String(page));
    params.set("perPage", String(EXPORT_PAGE));
    const result = await store.list(params);
    if (!result.ok) return result;
    rows.push(...result.data.data);
    if (page >= result.data.meta.totalPages) break;
    if (rows.length >= EXPORT_LIMIT) {
      truncated = true;
      break;
    }
  }

  const csv = toCsv(rows, columns.map(([key, label]) => ({ key, label })));
  return { ok: true, data: { csv, rows: rows.length, truncated } };
}

export async function createRecordAction(resourceName: string, input: unknown): Promise<ActionResult<Record<string, unknown>>> {
  const denied = await allowed(resourceName, "create");
  if (denied) return denied;

  const store = dashboardStore(resourceName);
  const result = await store.create(input);
  if (result.ok) revalidatePath(resourcePath(store.resource));
  return result;
}

export async function updateRecordAction(resourceName: string, id: string, input: unknown): Promise<ActionResult<Record<string, unknown>>> {
  const denied = await allowed(resourceName, "update");
  if (denied) return denied;

  const store = dashboardStore(resourceName);
  const result = await store.update(id, input);
  if (result.ok) revalidatePath(resourcePath(store.resource));
  return result;
}

const NO_FILES: ActionResult<never> = { ok: false, status: 501, error: "File fields aren't supported by Nevela yet." };

/** File uploads go through Laravel's filesystem once Nevela generates file fields (see the roadmap). */
export async function createUploadUrlAction(
  _resourceName: string,
  _fieldKey: string,
  _file: { name: string; type: string; size: number },
): Promise<ActionResult<{ url: string; key: string }>> {
  return NO_FILES;
}

export async function createReadUrlAction(_resourceName: string, _fieldKey: string, _key: string, _downloadAs?: string): Promise<ActionResult<{ url: string }>> {
  return NO_FILES;
}
