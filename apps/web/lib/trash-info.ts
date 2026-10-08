/**
 * What a delete button needs to know to say truthfully what pressing it does. Kept apart
 * from lib/trash.ts, which talks to Laravel and so can't be loaded in the browser.
 */
export interface TrashInfo {
  /** How many days a deleted record can be restored, or null when it is kept until someone removes it. */
  days: number | null;
}

/** "for 30 days", or "until someone removes it for good". */
export function keptFor(trash: TrashInfo): string {
  return trash.days === null ? "until someone removes it for good" : `for ${trash.days} ${trash.days === 1 ? "day" : "days"}`;
}
