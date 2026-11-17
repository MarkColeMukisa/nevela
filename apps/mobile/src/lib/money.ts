/**
 * Money as people read it, as the dashboard writes it: in its currency and with that
 * currency's own decimals, "UGX 4,500" and "$4,500.00". Kept free of anything that needs
 * the app running, so it can be tested on its own.
 */

/** How many decimals a currency is written with: 0 for UGX and JPY, 2 for USD. Two when there is no currency, or it isn't known. */
export function currencyDigits(currency?: string | null): number {
  if (!currency) return 2;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/**
 * An amount of money in its currency, or null when there is none to show it in or the
 * value isn't a number, so the caller shows it plainly as it always did.
 */
export function formatMoney(value: unknown, currency?: string | null): string | null {
  if (!currency || value === null || value === undefined || value === "" || Number.isNaN(Number(value))) return null;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value));
  } catch {
    return null;
  }
}
