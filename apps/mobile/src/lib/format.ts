import { formatMoney } from "./money";
import { optionLabel, type FieldSpec } from "./resources";

/** A file as a record carries it beside the field, as `<field>File`. */
export interface StoredFile {
  url: string;
  name: string;
  mime: string;
  renditions?: Record<string, { url: string }>;
}

/** The small picture of an image file, or the file itself where it has none. */
export function thumb(file: StoredFile | null | undefined): string | null {
  if (!file || !file.mime?.startsWith("image/")) return null;
  return file.renditions?.thumb?.url ?? file.url;
}

/** The files of a file field, one or several, from the record. */
export function filesOf(name: string, field: FieldSpec, record: Record<string, unknown>): StoredFile[] {
  const found = field.multiple ? record[`${name}Files`] : record[`${name}File`];
  return (Array.isArray(found) ? found : found ? [found] : []) as StoredFile[];
}

function number(value: number, digits?: number): string {
  try {
    return value.toLocaleString(undefined, digits === undefined ? undefined : { minimumFractionDigits: digits, maximumFractionDigits: digits });
  } catch {
    return String(value);
  }
}

/**
 * A field's value as a person reads it. Empty for nothing. A belongsTo is its id here:
 * the screen swaps in the related record's title once it has it.
 */
export function display(field: FieldSpec, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  switch (field.kind) {
    case "boolean":
      return value ? "Yes" : "No";
    case "enum":
      return optionLabel(field, String(value));
    case "int":
    case "float": {
      const amount = Number(value);
      if (Number.isNaN(amount)) return String(value);
      // In its currency with the currency's own decimals (UGX has none), as the dashboard writes it.
      if (field.format === "money") return formatMoney(amount, field.currency) ?? number(amount, 2);
      if (field.format === "percent") return `${number(amount)}%`;
      if (field.format === "rating") return `${number(amount)} ★`;
      return number(amount);
    }
    case "date": {
      // A date has no time and no zone: 2026-11-15 is that day wherever it is read.
      const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
      const date = new Date(year, (month || 1) - 1, day || 1);
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    }
    case "datetime": {
      const date = new Date(String(value));
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    }
    case "json":
      return typeof value === "string" ? value : JSON.stringify(value);
    case "text":
      // Rich text is HTML. A phone screen shows its words.
      return field.format === "rich" ? String(value).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim() : String(value);
    default:
      return String(value);
  }
}

/** A datetime as the form's text box holds it: "2026-11-15 14:30", in the phone's own time. */
export function toLocalInput(iso: unknown): string {
  if (!iso) return "";
  const date = new Date(String(iso));
  if (Number.isNaN(date.getTime())) return String(iso);
  const two = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** What the form's text box holds, back as the API takes it. Null when it isn't a date and time. */
export function fromLocalInput(text: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  // JavaScript rolls the 31st of February over into March. What was typed has to be
  // the date that comes out.
  const same = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && date.getHours() === hour && date.getMinutes() === minute;
  return same ? date.toISOString() : null;
}
