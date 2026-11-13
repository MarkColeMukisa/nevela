import { initialFormValues, optionLabel, storedFields, type FormValues, type Resource, type StoredField } from "@flaredev/core";

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

/** A record's lines as rows of the form: what line-items' rows are made of. */
interface Row {
  id?: string;
  values: Record<string, unknown>;
}

/**
 * Lines as a save would send them, for comparing two sets: each one's id and values, less
 * the rows nobody has filled in. The line's field that points back at the record is
 * left out, as it is from the form.
 */
function linesKey(resource: Pick<Resource, "fields">, field: string, rows: Row[]): string {
  const blank = initialFormValues(resource, null);
  const keys = storedFields(resource)
    .map(([key]) => key)
    .filter((key) => key !== field);
  const filled = rows.filter((row) => row.id || keys.some((key) => String(row.values[key] ?? "") !== String(blank[key] ?? "")));
  return JSON.stringify(filled.map((row) => [row.id ?? "", ...keys.map((key) => String(row.values[key] ?? ""))]));
}

export type LinesMerge<T extends Row> =
  /** Unchanged by them, or changed by both of you the same way: yours stand. */
  | { kind: "yours" }
  /** Changed by them only: theirs come in. */
  | { kind: "theirs"; rows: T[] }
  /** Changed by both of you, differently: yours stay until you choose. */
  | { kind: "clash"; rows: T[] | null };

/**
 * The lines, merged as a whole. A save replaces a record's lines with the list it sends,
 * so they can't be put together line by line the way fields are: whoever's list is sent
 * is the list. `theirs` is null when the record came back without its lines.
 */
export function mergeLines<T extends Row>(resource: Pick<Resource, "fields">, field: string, base: T[], mine: T[], theirs: T[] | null): LinesMerge<T> {
  if (theirs === null) return { kind: "clash", rows: null };
  const from = linesKey(resource, field, base);
  const yours = linesKey(resource, field, mine);
  const now = linesKey(resource, field, theirs);
  if (now === from || now === yours) return { kind: "yours" };
  return yours === from ? { kind: "theirs", rows: theirs } : { kind: "clash", rows: theirs };
}

/** "Phone", "Phone and Stage", "Phone, Stage and Owner". */
export function andList(labels: string[]): string {
  return labels.length <= 1 ? (labels[0] ?? "") : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}
