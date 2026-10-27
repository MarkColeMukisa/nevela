// What a line comes to, where that can be told: a quantity times a price. Shared by the
// form, which works it out as you type, and the record's page.

import type { StoredField } from "@flaredev/core";
import { displayValue } from "./format";

export interface LineAmounts {
  /** What one line comes to, or null while its quantity or price is missing. */
  amount: (values: Record<string, unknown>) => number | null;
  /** A sum of money, in the price's currency. */
  format: (value: number) => string;
}

/**
 * The quantity is a whole or decimal number called quantity or qty, and the price the
 * first money field. Lines without both have no amounts, and no total.
 */
export function lineAmounts(fields: [string, StoredField][]): LineAmounts | null {
  const quantity = fields.find(([key, def]) => (def.kind === "int" || def.kind === "float") && /^(quantity|qty)$/i.test(key));
  const price = fields.find(([, def]) => def.kind === "float" && (def as { format?: string }).format === "money");
  if (!quantity || !price) return null;
  const given = (value: unknown) => value !== null && value !== undefined && String(value).trim() !== "";
  return {
    amount: (values) => {
      const count = Number(values[quantity[0]]);
      const each = Number(values[price[0]]);
      return given(values[quantity[0]]) && given(values[price[0]]) && Number.isFinite(count) && Number.isFinite(each) ? count * each : null;
    },
    format: (value) => displayValue(price[1], value),
  };
}
