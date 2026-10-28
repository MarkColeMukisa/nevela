/**
 * Fields Laravel fills itself, which a form shows rather than asks for.
 *
 * A copied field is taken from a record this one points at, such as an order item's
 * price from its product (`"from": "productId.price"` in the descriptor). A numbered one
 * is given the next number when the record is made (`"auto": "INV"`). Either can be left
 * empty: what Laravel gives it is what it is.
 */

/** Where a field is copied from: its relation and that record's field. */
export function copiedFrom(def: object): { relation: string; field: string } | undefined {
  const from = (def as { from?: unknown }).from;
  if (typeof from !== "string" || !from.includes(".")) return undefined;
  const [relation, field] = from.split(".");
  return relation && field ? { relation, field } : undefined;
}

/** The prefix of a numbered field's numbers: "INV" for INV-0001. */
export function numberedAs(def: object): string | undefined {
  const auto = (def as { auto?: unknown }).auto;
  return typeof auto === "string" && auto !== "" ? auto : undefined;
}
