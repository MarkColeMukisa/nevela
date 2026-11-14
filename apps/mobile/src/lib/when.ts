/** "just now", "5 minutes ago", "3 days ago", then the date. For a time in the past, ISO 8601. */
export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const steps: [number, string][] = [[60, "minute"], [24, "hour"], [30, "day"]];
  let amount = seconds / 60;
  for (const [size, unit] of steps) {
    if (amount < size) {
      const whole = Math.floor(amount);
      return `${whole} ${unit}${whole === 1 ? "" : "s"} ago`;
    }
    amount /= size;
  }
  return new Date(then).toLocaleDateString();
}
