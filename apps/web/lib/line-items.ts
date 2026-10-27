// A record's lines, for its form and its page: an order's items.
//
// The descriptor says which resource they are (its "items"); Laravel sends them with the
// record as `items`, in the order they were added, and takes them back the same way.

import { clientResource, storedFields, type Resource } from "@flaredev/core";
import type { LineItemsSetup } from "@/components/dashboard/line-items";
import type { RelationMeta } from "@/components/dashboard/fields/field-widget";
import { allResources, dashboardStore } from "./dashboard";
import { itemsOf } from "./extras";

/** The resource a record's lines are, when it has some. */
export function linesResource(resource: Resource): { lines: Resource; field: string } | undefined {
  const items = itemsOf(resource.name);
  const lines = items && allResources().find((candidate) => candidate.name === items.resource);
  return items && lines ? { lines, field: items.field } : undefined;
}

/** The lines a record came with from Laravel. */
export function linesOf(record: Record<string, unknown> | null): Record<string, unknown>[] {
  return Array.isArray(record?.items) ? (record.items as Record<string, unknown>[]) : [];
}

/**
 * The names of the records the lines point at (a line's product), by field and then id,
 * fetched once for all of them.
 */
export async function lineTitles(lines: Resource, field: string, rows: Record<string, unknown>[]): Promise<Record<string, Record<string, string>>> {
  const byName = new Map(allResources().map((resource) => [resource.name, resource]));
  const titles: Record<string, Record<string, string>> = {};
  for (const [key, def] of storedFields(lines)) {
    const target = def.kind === "belongsTo" && key !== field ? byName.get(def.target) : undefined;
    if (!target) continue;
    const ids = [...new Set(rows.map((row) => row[key]).filter((value): value is string => typeof value === "string"))];
    titles[key] = ids.length > 0 ? await dashboardStore(target.name).titles(ids) : {};
  }
  return titles;
}

/** What the form needs to edit a record's lines. Undefined for a resource without any. */
export async function lineItemsSetup(resource: Resource, record: Record<string, unknown> | null): Promise<LineItemsSetup | undefined> {
  const found = linesResource(resource);
  if (!found) return undefined;
  const { lines, field } = found;
  const byName = new Map(allResources().map((candidate) => [candidate.name, candidate]));
  const relations: Record<string, RelationMeta> = {};
  for (const [key, def] of storedFields(lines)) {
    const target = def.kind === "belongsTo" && key !== field ? byName.get(def.target) : undefined;
    if (target) relations[key] = { name: target.name, label: target.label, pluralLabel: target.pluralLabel, slug: target.slug, titleField: target.titleField };
  }
  const rows = linesOf(record);

  return { resource: clientResource(lines), field, relations, titles: await lineTitles(lines, field, rows), rows };
}
