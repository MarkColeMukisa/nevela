import type { Resource } from "@flaredev/core";
import { displayValue } from "@/lib/format";

/** A record's name as a list shows it: its title field, or its id. */
export function recordTitle(resource: Resource, record: Record<string, unknown>): string {
  const def = resource.fields[resource.titleField];
  const shown = def && def.kind !== "hasMany" ? displayValue(def, record[resource.titleField]) : "";
  return shown || String(record.id ?? "");
}
