/**
 * Reading CHANGELOG.md for the docs' list of releases: which versions there are, what
 * each was about in a line, and which week each came out in.
 */

export interface Release {
  /** "0.7.1" */
  version: string;
  /** "2026-10-09" */
  date: string;
  /** The release in a few words. May hold `code` in backticks. */
  headline: string;
}

export interface Week {
  /** The Monday it starts on, as "2026-10-05". */
  start: string;
  /** "October 5 to 11, 2026" */
  label: string;
  releases: Release[];
}

/**
 * What a release was about. The first line under its heading says so, in italics. One
 * that has no such line is called by the first thing it lists.
 */
export function headlineOf(body: string): string {
  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
  const written = /^_(.+)_$/.exec(lines[0] ?? "") ?? /^\*([^*].*[^*]|[^*])\*$/.exec(lines[0] ?? "");
  if (written) return written[1]!;

  const first = lines.find((line) => line.startsWith("- "))?.slice(2) ?? "";
  const lead = /^\*\*(.+?)\*\*/.exec(first);
  const text = (lead ? lead[1]! : first.replace(/\*\*/g, "").split(/(?<=[.:])\s/)[0]!).replace(/[.:,]$/, "");
  return text.length > 90 ? `${text.slice(0, 87).trimEnd()}…` : text;
}

/** Every released version in the file, in the file's order: the newest first. */
export function releasesIn(changelog: string): Release[] {
  const found: Release[] = [];
  for (const section of changelog.replace(/\r\n/g, "\n").split(/\n(?=## \[)/)) {
    const heading = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})\n([\s\S]*)$/.exec(section.trimStart());
    if (heading) found.push({ version: heading[1]!, date: heading[2]!, headline: headlineOf(heading[3]!) });
  }
  return found;
}

const DAY = 86_400_000;

/** The Monday of the week a date falls in. Dates are days, with no time or place, so all of this is in UTC. */
function monday(date: string): Date {
  const day = new Date(`${date}T00:00:00Z`);
  return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY);
}

/** "October 5 to 11, 2026", and the longer forms for a week that crosses a month or a year. */
export function weekLabel(start: Date): string {
  const end = new Date(start.getTime() + 6 * DAY);
  const month = (date: Date) => date.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const [fromYear, toYear] = [start.getUTCFullYear(), end.getUTCFullYear()];
  if (fromYear !== toYear) return `${month(start)} ${start.getUTCDate()}, ${fromYear} to ${month(end)} ${end.getUTCDate()}, ${toYear}`;
  if (start.getUTCMonth() !== end.getUTCMonth()) return `${month(start)} ${start.getUTCDate()} to ${month(end)} ${end.getUTCDate()}, ${toYear}`;
  return `${month(start)} ${start.getUTCDate()} to ${end.getUTCDate()}, ${toYear}`;
}

/** The releases, grouped by the week (Monday to Sunday) they came out in, keeping their order. */
export function byWeek(releases: Release[]): Week[] {
  const weeks: Week[] = [];
  for (const release of releases) {
    const start = monday(release.date);
    const key = start.toISOString().slice(0, 10);
    const week = weeks.find((candidate) => candidate.start === key);
    if (week) week.releases.push(release);
    else weeks.push({ start: key, label: weekLabel(start), releases: [release] });
  }
  return weeks;
}

/** A headline as HTML: escaped, with `code` in backticks as code. */
export function inline(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
}
