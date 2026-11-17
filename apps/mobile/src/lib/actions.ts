import type { User } from "./auth";
import type { Resource, ResourceAction, ResourceRecord } from "./resources";

type WhenValue = string | number | boolean | null;

/** "markReady" → "orders.mark_ready": the permission an action asks for, as Laravel names it. */
export function actionPermission(resource: Pick<Resource, "table">, key: string): string {
  return `${resource.table}.${key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()}`;
}

/** Whether a record's values are what an action's `when` asks for: one value, or a list it may be any of. */
export function actionApplies(action: Pick<ResourceAction, "when">, record: Record<string, unknown>): boolean {
  return Object.entries(action.when ?? {}).every(([field, wanted]) => {
    const value = record[field] ?? null;
    const matches = (one: WhenValue) => {
      if (one === null) return value === null;
      if (value === null) return false;
      // A yes/no value may arrive as 1 or 0.
      if (typeof one === "boolean") return (value === true || value === 1 || value === "1") === one;
      return String(value) === String(one);
    };
    return Array.isArray(wanted) ? wanted.some(matches) : matches(wanted);
  });
}

/**
 * The actions a person may do to this record as it is now: theirs by permission (each its
 * own, "orders.accept"), and applying to the record's values. Laravel checks both again.
 */
export function recordActions(user: Pick<User, "isAdmin" | "permissions"> | null, resource: Pick<Resource, "table" | "actions">, record: ResourceRecord): ({ key: string } & ResourceAction)[] {
  if (!user) return [];
  return Object.entries(resource.actions ?? {})
    .filter(([key, action]) => (action.on ?? "record") === "record" && (user.isAdmin || user.permissions.includes(actionPermission(resource, key))))
    .filter(([, action]) => actionApplies(action, record))
    .map(([key, action]) => ({ key, ...action }));
}
