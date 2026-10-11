// What a resource has beyond its fields, which Flare's descriptor has no place for.
//
// Written by `php nevela generate` into resources/index.ts as `extras`, by resource
// name, from the descriptors in the Laravel app. Read through here, on the server: a
// client component is handed what it needs of it as props.

import * as registry from "@/resources";

/** A field an action asks for, as the descriptor has it. */
export interface ActionField {
  kind: "string" | "text" | "int" | "float" | "boolean" | "date" | "datetime" | "enum";
  format?: string;
  options?: string[];
  required?: boolean;
  label?: string;
  maxLength?: number;
}

/**
 * Something that can be done to a record, or to the list, beyond creating, editing and
 * deleting: the descriptor's "actions" section. What it does is a class in the Laravel
 * app; this is what the dashboard needs to offer it.
 */
export interface ResourceAction {
  /** Its name in the descriptor and in the address: "accept". */
  key: string;
  /** The permission that allows it: "internship_applications.accept". */
  permission: string;
  label: string;
  /** A lucide icon name. */
  icon?: string;
  /** Where its button is: on one record, or on the list as a whole. */
  on: "record" | "collection";
  /** A question asked before it runs. */
  confirm?: string;
  /** Field values a record must have for the action to apply to it. */
  when?: Record<string, string | number | boolean | null>;
  /** What it asks for, in a sheet. */
  fields?: Record<string, ActionField>;
  /** A record action that can also be run on the rows selected in the table. */
  many?: boolean;
}

interface ResourceExtras {
  actions?: Record<string, Omit<ResourceAction, "key">>;
}

/** An app generated before there were any has no `extras` in its registry, and none to have. */
const extras = ((registry as { extras?: unknown }).extras ?? {}) as Record<string, ResourceExtras>;

/** A resource's actions, in the order the descriptor gives them. */
export function actionsOf(resourceName: string): ResourceAction[] {
  return Object.entries(extras[resourceName]?.actions ?? {}).map(([key, action]) => ({ ...action, key }));
}

/** Whether an action applies to a record as it is now. Laravel asks the same before running it. */
export function actionApplies(action: ResourceAction, record: Record<string, unknown>): boolean {
  return Object.entries(action.when ?? {}).every(([field, wanted]) => {
    const value = record[field] ?? null;
    if (wanted === null) return value === null;
    if (value === null) return false;
    // A yes/no value may arrive as 1 or 0.
    if (typeof wanted === "boolean") return (value === true || value === 1 || value === "1") === wanted;
    return String(value) === String(wanted);
  });
}
