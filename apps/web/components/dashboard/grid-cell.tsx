"use client";

import type { StoredField } from "@flaredev/core";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { isRich } from "@/lib/rich";
import { FieldWidget, type RelationMeta } from "./fields/field-widget";

// One cell of a grid of records: "Add several", and a record's lines.

type FieldDef = StoredField & { label: string };

/** Kinds that fit in a cell: one control, one value. A file needs its own upload, so it is left to the form. */
const IN_A_CELL = new Set(["string", "text", "int", "float", "boolean", "date", "datetime", "enum", "belongsTo"]);
/** A file needs an upload and rich text needs an editor: neither is something to type into a cell. */
export const fitsACell = (def: { kind: string }) => IN_A_CELL.has(def.kind) && !isRich(def);

/**
 * One cell. Long text is a single line here and a tick box is a tick box: a grid is for
 * typing across, and a four-line text area or a labelled switch in every row is neither
 * quick nor readable. Everything else is the form's own control, so a date, a price or a
 * link to another record behaves exactly as it does there.
 */
export function Cell({
  id,
  resourceName,
  fieldKey,
  field,
  label,
  value,
  invalid,
  disabled,
  relation,
  onChange,
}: {
  id: string;
  resourceName: string;
  fieldKey: string;
  field: FieldDef;
  label: string;
  value: string | boolean;
  invalid: boolean;
  disabled: boolean;
  relation?: RelationMeta & { initialTitle?: string };
  onChange: (value: string | boolean) => void;
}) {
  if (field.kind === "boolean") {
    return <Checkbox id={id} aria-label={label} checked={value === true} disabled={disabled} onCheckedChange={(checked) => onChange(checked === true)} className="mt-2" />;
  }
  if (field.kind === "text") {
    return <Input id={id} aria-label={label} value={typeof value === "string" ? value : ""} disabled={disabled} aria-invalid={invalid || undefined} onChange={(event) => onChange(event.target.value)} />;
  }
  return (
    <div aria-label={label} role="group">
      <FieldWidget id={id} name={id} resourceName={resourceName} fieldKey={fieldKey} field={field} value={value} onChange={onChange} invalid={invalid} disabled={disabled} relation={relation} />
    </div>
  );
}
