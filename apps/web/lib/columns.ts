/**
 * Which of a table's columns are on before anyone chooses.
 *
 * The descriptor can decide for a field: `"list": true` is always on, `"hidden"` is in the
 * Columns menu but off. Long text and files that aren't pictures start off too; the
 * generator writes that as `column: "hidden"`. Every other column is on while there is
 * room: the first DEFAULT_COLUMNS of them, so a resource with twelve fields doesn't open
 * as a table too wide to read. Created is always on.
 */
export const DEFAULT_COLUMNS = 6;

/** How many characters of a long value a cell is sent. The cell cuts it to its width; this keeps the page small. */
export const CELL_TEXT = 120;

type Listed = { key: string; def: object };

/** What the descriptor decided for a field's column, if it did. */
export function columnSetting(def: object): "shown" | "hidden" | undefined {
  const column = (def as { column?: unknown }).column;
  return column === "shown" || column === "hidden" ? column : undefined;
}

export function defaultColumns(columns: Listed[]): string[] {
  let left = DEFAULT_COLUMNS;
  return columns.flatMap(({ key, def }) => {
    if (key === "createdAt") return [key];
    const setting = columnSetting(def);
    if (setting === "hidden") return [];
    if (setting === undefined && left <= 0) return [];
    left -= 1;
    return [key];
  });
}

/** The start of a long value, for a cell. */
export function cellText(text: string): string {
  return text.length > CELL_TEXT ? `${text.slice(0, CELL_TEXT).trimEnd()}…` : text;
}
