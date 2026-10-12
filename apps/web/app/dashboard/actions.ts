"use server";

import { revalidatePath } from "next/cache";
import { storedFields, type PolicyAction } from "@flaredev/core";
import type { FieldIssue } from "@/lib/resource/store";
import { toCsv } from "@/lib/csv";
import { revalidateResource } from "@/lib/cache";
import { fileUrl } from "@/lib/files";
import { laravel } from "@/lib/laravel";
import { allResources, resourcePath, dashboardSession, dashboardStore, mayDo } from "@/lib/dashboard";
import { actionsOf, formOf, publishFieldOf } from "@/lib/extras";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; issues?: FieldIssue[]; field?: string };

const forbidden = (message = "You don't have access to this."): ActionResult<never> => ({ ok: false, status: 403, error: message });

/**
 * Session check, plus what the person's roles allow. Laravel's policy is the real
 * decision and answers 403 itself; this only saves a round trip.
 */
async function allowed(resourceName: string, action: PolicyAction): Promise<ActionResult<never> | undefined> {
  const { allowed: inAdmin } = await dashboardSession();
  if (!inAdmin) return forbidden();
  const resource = allResources().find((item) => item.name === resourceName);
  if (!resource || !(await mayDo(resource, action))) return forbidden(`Your role can't ${action} this record.`);
}

export async function deleteRecordAction(resourceName: string, id: string): Promise<ActionResult<{ id: string }>> {
  const denied = await allowed(resourceName, "delete");
  if (denied) return denied;

  const store = dashboardStore(resourceName);
  const result = await store.delete(id);
  if (result.ok) revalidatePath(resourcePath(store.resource));
  return result;
}

/**
 * Run one of a resource's own actions (the descriptor's "actions"): on one record, on
 * the rows selected, or on the list as a whole.
 *
 * Laravel does it, in the class the app wrote for it, and decides everything: who may,
 * whether it applies, whether what was filled in is valid. Its answer comes back as it
 * is, so a problem with a field can be shown on that field.
 */
export async function runResourceAction(
  resourceName: string,
  key: string,
  target: { id?: string; ids?: string[] },
  input: Record<string, unknown> = {},
): Promise<ActionResult<{ message: string; done?: number; skipped?: number }>> {
  const { allowed: inAdmin, may } = await dashboardSession();
  const resource = allResources().find((item) => item.name === resourceName);
  const action = actionsOf(resourceName).find((item) => item.key === key);
  if (!inAdmin || !resource || !action || !may(action.permission)) return forbidden();
  if (target.ids && target.ids.length > 500) return { ok: false, status: 400, error: "That's more than 500 records. Do them in smaller batches." };

  const path = target.id ? `${resource.slug}/${encodeURIComponent(target.id)}/_actions/${key}` : `${resource.slug}/_actions/${key}`;
  const response = await laravel(path, { method: "POST", body: { input, ...(target.ids ? { ids: target.ids } : {}) } });
  const body = (response.body ?? {}) as { message?: string; done?: number; skipped?: number; error?: string; detail?: string; issues?: FieldIssue[] };
  if (!response.ok) {
    // `detail` is only sent while the Laravel app is in debug mode: the reason, for whoever is building it.
    return { ok: false, status: response.status, error: body.detail ? `${body.error ?? "It didn't work."} ${body.detail}` : (body.error ?? "It didn't work."), issues: body.issues };
  }
  // What it changed could be anything of this resource's, so everything of it is read again.
  revalidateResource({ resource: resourceName, action: "update", id: target.id ?? "" });
  revalidatePath(resourcePath(resource));
  return { ok: true, data: { message: body.message ?? `${action.label}: done.`, done: body.done, skipped: body.skipped } };
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
  // Someone who joined a list and hasn't proved their address isn't on it yet.
  const confirmedOnly = formOf(resourceName)?.confirm !== undefined && !new URLSearchParams(query).has("filter[confirmed]");
  for (let page = 1; rows.length < EXPORT_LIMIT; page++) {
    const params = new URLSearchParams(query);
    if (confirmedOnly) params.set("filter[confirmed]", "true");
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

export type InsightsUnit = "day" | "week" | "month";

export interface InsightsData {
  /** Everything the list matches, whenever it was created. */
  total: number;
  unit: InsightsUnit;
  /** How many were created in each period, oldest first. A day or a week is "2026-10-05" (a week by its Monday), a month "2026-10". */
  series: { bucket: string; count: number }[];
  /** How the records split across each field that is a choice. */
  breakdown: { field: string; kind: "enum" | "boolean"; slices: { value: string; count: number }[] }[];
}

/**
 * The counts behind the insights panel: `GET /{slug}/_insights`.
 *
 * `query` is the list's own search and filters, so the charts are of the rows the table
 * is showing. Asked for only when the panel is opened.
 */
export async function resourceInsightsAction(resourceName: string, query: string, unit: InsightsUnit): Promise<ActionResult<InsightsData>> {
  const denied = await allowed(resourceName, "read");
  if (denied) return denied;

  const { resource } = dashboardStore(resourceName);
  const params = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(query)) if (key === "q" || key.startsWith("filter[")) params.append(key, value);
  params.set("unit", unit);
  const response = await laravel(`${resource.slug}/_insights?${params}`);
  if (!response.ok) {
    const body = (response.body ?? {}) as { error?: string };
    // An app whose Laravel side is from before this existed has no such address.
    const missing = response.status === 404 || response.status === 405;
    return { ok: false, status: response.status, error: missing ? "This app's API has no insights yet. Run: nevela upgrade" : (body.error ?? "Request failed.") };
  }
  return { ok: true, data: response.body as InsightsData };
}

/** What was wrong with one row of several, numbered from 1 among the rows that were sent. */
export interface RowProblem {
  row: number;
  issues: FieldIssue[];
}

export type CreateManyResult = { ok: true; data: { created: number } } | { ok: false; status: number; error: string; rows?: RowProblem[] };

/**
 * Several records at once, for the "Add several" grid: `POST /{slug}/_bulk`.
 *
 * Laravel checks every row with the rules it uses for one, and saves them in a single
 * transaction. So the answer is all of them, or none and the rows that were wrong.
 */
export async function createManyAction(resourceName: string, rows: Record<string, unknown>[]): Promise<CreateManyResult> {
  const denied = await allowed(resourceName, "create");
  if (denied) return denied;
  if (rows.length === 0) return { ok: false, status: 400, error: "Nothing to create: every row is empty." };

  const { resource } = dashboardStore(resourceName);
  const response = await laravel(`${resource.slug}/_bulk`, { method: "POST", body: { items: rows } });
  const body = (response.body ?? {}) as { error?: string; rows?: RowProblem[]; created?: number; data?: { id?: unknown }[] };
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      // An app whose Laravel side is from before this existed answers 404 or 405.
      error: response.status === 404 || response.status === 405 ? "This app's API can't create several at once yet. Run: nevela upgrade" : (body.error ?? "Request failed."),
      ...(body.rows ? { rows: body.rows } : {}),
    };
  }

  try {
    revalidateResource({ resource: resource.name, action: "create", id: String(body.data?.[0]?.id ?? "") });
  } catch (error) {
    console.error(`[nevela] ${resource.name} bulk create cache invalidation failed:`, error);
  }
  revalidatePath(resourcePath(resource));
  return { ok: true, data: { created: body.created ?? rows.length } };
}

export async function updateRecordAction(resourceName: string, id: string, input: unknown): Promise<ActionResult<Record<string, unknown>>> {
  const denied = await allowed(resourceName, "update");
  if (denied) return denied;

  const store = dashboardStore(resourceName);
  const result = await store.update(id, input);
  if (result.ok) revalidatePath(resourcePath(store.resource));
  return result;
}

/**
 * Publish a record now, or take it back to a draft: its publish date is set to this
 * moment, or cleared. An edit like any other, so it takes the permission to edit, and
 * Laravel's policy has the last word.
 */
export async function publishRecordAction(resourceName: string, id: string, publish: boolean): Promise<ActionResult<Record<string, unknown>>> {
  const field = publishFieldOf(resourceName);
  if (!field) return { ok: false, status: 404, error: "This isn't something that is published." };
  return updateRecordAction(resourceName, id, { [field]: publish ? new Date().toISOString() : null });
}

/**
 * Where the browser sends a file for a file or image field.
 *
 * The address is this app's own /api route, which passes the file to Laravel with the
 * person's token. Laravel checks the type, the size and the contents, optimises an image,
 * and answers with the key it stored the file under: that key, not the empty one here, is
 * what the form keeps.
 */
export async function createUploadUrlAction(
  resourceName: string,
  fieldKey: string,
  file: { name: string; type: string; size: number },
): Promise<ActionResult<{ url: string; key: string }>> {
  const { allowed: inAdmin } = await dashboardSession();
  const target = allResources().find((item) => item.name === resourceName);
  if (!inAdmin || !target || !((await mayDo(target, "create")) || (await mayDo(target, "update")))) return forbidden("Your role can't add files to this record.");

  const field = dashboardStore(resourceName).resource.fields[fieldKey];
  if (!field || field.kind !== "file") return { ok: false, status: 404, error: "That isn't a file field." };

  const query = new URLSearchParams({ name: file.name });
  return { ok: true, data: { url: `/api/_nevela/uploads/${encodeURIComponent(resourceName)}/${encodeURIComponent(fieldKey)}?${query}`, key: "" } };
}

/** The address of a stored file. Kept for code that asks for one; the dashboard builds it with fileUrl(). */
export async function createReadUrlAction(_resourceName: string, _fieldKey: string, key: string): Promise<ActionResult<{ url: string }>> {
  const { allowed: inAdmin } = await dashboardSession();
  if (!inAdmin) return forbidden();
  return { ok: true, data: { url: fileUrl(key) } };
}
