// A field that applies for some values of another only: a billing cycle, for a recurring
// project (cycle:enum(monthly|annually) if kind == recurring).
//
// The generated descriptor says so with `when`, a key Flare doesn't know and carries
// along untouched. Laravel is what decides: it needs the field where it applies and
// empties it elsewhere, however a record arrives. This keeps the form to what applies.

export interface Condition {
  /** The field it depends on. */
  field: string;
  /** The values of that field it applies for. */
  values: (string | boolean)[];
  /** Whether it is needed where it applies. */
  required: boolean;
}

export function conditionOf(def: object): Condition | undefined {
  return (def as { when?: Condition }).when;
}

/** Whether a field applies, given the form's values. One without a condition always does. */
export function applies(def: object, values: Record<string, unknown>): boolean {
  const when = conditionOf(def);
  if (!when) return true;
  const value = values[when.field];
  return when.values.some((wanted) =>
    typeof wanted === "boolean" ? (value === true || value === "true" || value === 1 || value === "1") === wanted : value !== undefined && value !== null && String(value) === wanted,
  );
}
