import { optionLabel, type FormValues, type StoredField } from "@flaredev/core";

/** What Laravel answers a change to a record someone else saved after it was read. */
export const CHANGED_SINCE_READ = "CHANGED_SINCE_READ";

/** The record as it is now, when a failed save was refused for being out of date. */
export function savedSince(result: unknown): Record<string, unknown> | null {
  const { code, current } = (result ?? {}) as { code?: string; current?: unknown };
  return code === CHANGED_SINCE_READ && current && typeof current === "object" ? (current as Record<string, unknown>) : null;
}

export interface Merged {
  /** The form's values, with every change of theirs that didn't meet one of yours. */
  values: FormValues;
  /** Fields only they changed: theirs are now in the form. */
  theirs: string[];
  /** Fields you both changed, to different values: yours are kept, and this is theirs. */
  clashes: Record<string, string | boolean>;
}

/**
 * Your edits and someone else's save, put together field by field, as a three-way merge
 * from the record you both started with. A field only they changed takes their value; one
 * only you changed keeps yours; one you both changed to the same value is no conflict.
 * One you both changed differently keeps yours, and is listed with theirs for you to decide.
 */
export function mergeEdits(fields: [string, StoredField][], base: FormValues, mine: FormValues, theirs: FormValues): Merged {
  const values = { ...mine };
  const brought: string[] = [];
  const clashes: Record<string, string | boolean> = {};
  for (const [key] of fields) {
    const from = base[key] ?? "";
    const yours = mine[key] ?? "";
    const now = theirs[key] ?? "";
    if (same(now, from) || same(now, yours)) continue;
    if (same(yours, from)) {
      values[key] = now;
      brought.push(key);
    } else {
      clashes[key] = now;
    }
  }
  return { values, theirs: brought, clashes };
}

function same(a: string | boolean, b: string | boolean): boolean {
  return String(a) === String(b);
}

/**
 * Their value, short enough to read beside the field: "Won", "Yes", "empty". Null for a
 * value that doesn't read as a line of text: a relation's id, a file, rich text, JSON.
 */
export function readable(def: StoredField, value: string | boolean): string | null {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === "") return "empty";
  if (def.kind === "belongsTo" || def.kind === "file" || def.kind === "json" || def.kind === "multiselect") return null;
  if (def.kind === "enum") return optionLabel(def, value);
  const text = value.replace(/<[^>]*>/g, "").trim();
  return text.length > 80 || text !== value.trim() ? null : text;
}

/** "Phone", "Phone and Stage", "Phone, Stage and Owner". */
export function andList(labels: string[]): string {
  return labels.length <= 1 ? (labels[0] ?? "") : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}
