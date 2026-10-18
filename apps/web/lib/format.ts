import { formatValue } from "@flaredev/core";
import { formatMoney } from "@/lib/number";

/**
 * A field's value as people read it: Flare's own formatting, except that money with a
 * currency is written in it ("UGX 4,500,000"), with that currency's decimals. Money with
 * no currency, and every other kind, reads as Flare has it.
 */
export function displayValue(def: Parameters<typeof formatValue>[0], value: unknown): string {
  if (def.kind === "float" && def.format === "money") {
    const money = formatMoney(value, def.currency);
    if (money !== null) return money;
  }
  return formatValue(def, value);
}
