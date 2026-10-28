"use client";

import { useRef } from "react";
import { createValidators, formValuesToInput, initialFormValues, issuesByField, storedFields, type ClientResource, type StoredField } from "@flaredev/core";
import { PlusIcon, XIcon } from "lucide-react";
import { copiedValue } from "@/app/dashboard/copied-actions";
import { Button } from "@/components/ui/button";
import { copiedFrom } from "@/lib/copied";
import { displayValue } from "@/lib/format";
import { lineAmounts } from "@/lib/line-totals";
import { cn } from "@/lib/utils";
import { Cell, fitsACell } from "./grid-cell";
import type { RelationMeta } from "./fields/field-widget";

type FieldDef = StoredField & { label: string };
type Values = Record<string, string | boolean>;

/** What a form needs to edit a record's lines: an order's items. Built on the server. */
export interface LineItemsSetup {
  /** The resource the lines are. */
  resource: ClientResource;
  /** Their field that points at the record they are lines of. Filled in by Laravel, so not shown. */
  field: string;
  /** Their other relations, for the pickers in the cells (a line's product). */
  relations: Record<string, RelationMeta>;
  /** The names of the records the lines point at now, by field and id, so a picker shows a name. */
  titles: Record<string, Record<string, string>>;
  /** The lines the record has, as the API gave them. None for a new record. */
  rows: Record<string, unknown>[];
}

export interface LineRow {
  /** Stays with the row as others are added and removed around it. */
  key: number;
  /** The line it is, once saved. A row without one is a new line. */
  id?: string;
  values: Values;
}

/** Problems by row key, then by field. "" holds what isn't about one field. */
export type LineProblems = Record<number, Record<string, string>>;

/** The most lines a record takes: what Laravel accepts at once unless the app says otherwise. */
const MOST_ROWS = 500;

/** The columns: every field a cell can hold, less the one that points back at the record. */
export function lineFields(setup: LineItemsSetup): [string, FieldDef][] {
  return (storedFields(setup.resource) as [string, FieldDef][]).filter(([key, def]) => key !== setup.field && fitsACell(def));
}

/** The rows a form starts with: the record's lines, or one empty row to type into. */
export function startRows(setup: LineItemsSetup): LineRow[] {
  const rows = setup.rows.map((row, key) => ({ key, id: typeof row.id === "string" ? row.id : undefined, values: initialFormValues(setup.resource, row) as Values }));
  return rows.length > 0 ? rows : [{ key: 0, values: initialFormValues(setup.resource, null) as Values }];
}

/** A row as it started, never touched: left out when the form is saved. */
function isBlank(setup: LineItemsSetup, row: LineRow): boolean {
  if (row.id) return false;
  const blank = initialFormValues(setup.resource, null) as Values;
  return lineFields(setup).every(([key]) => row.values[key] === blank[key]);
}

/**
 * The lines to send, checked first with the lines' own rules: what Laravel would refuse,
 * said beside the row before anything leaves the page. Empty rows are left out.
 */
export function linesToSend(setup: LineItemsSetup, rows: LineRow[]): { sent: LineRow[]; items: Record<string, unknown>[]; problems: LineProblems } {
  const fields = lineFields(setup);
  const validators = createValidators(setup.resource);
  const sent = rows.filter((row) => !isBlank(setup, row));
  const problems: LineProblems = {};
  const items = sent.map((row) => {
    const input = formValuesToInput(setup.resource, row.values, "create") as Record<string, unknown>;
    const parsed = validators.create.safeParse(input);
    if (!parsed.success) {
      // Its own field pointing back is Laravel's to fill in, so what is said of it here is not a problem.
      const found = Object.fromEntries(Object.entries(issuesByField(parsed.error.issues)).filter(([key]) => fields.some(([field]) => field === key)));
      if (Object.keys(found).length > 0) problems[row.key] = found;
    }
    const values = Object.fromEntries(Object.entries(input).filter(([key]) => fields.some(([field]) => field === key)));
    return row.id ? { id: row.id, ...values } : values;
  });
  return { sent, items, problems };
}

/**
 * What Laravel said of the lines ("items.2.quantity"), put back on the rows it is about.
 * Laravel counts only the rows that were sent; `sent` says which rows those were.
 */
export function problemsFromServer(setup: LineItemsSetup, sent: LineRow[], issues: { path: string; message: string }[]): LineProblems {
  const fields = lineFields(setup);
  const problems: LineProblems = {};
  for (const issue of issues) {
    const [first, index, field = ""] = issue.path.split(".");
    const row = first === "items" ? sent[Number(index)] : undefined;
    if (!row) continue;
    const known = fields.some(([key]) => key === field);
    (problems[row.key] ??= {})[known ? field : ""] ??= issue.message;
  }
  return problems;
}

/**
 * A record's lines, in its form: one row a line, each field a cell, with what each comes
 * to and the total when the lines have a quantity and a price. Saved with the record.
 */
export function LineItems({
  setup,
  rows,
  onRowsChange,
  problems,
  onProblemsChange,
  disabled,
}: {
  setup: LineItemsSetup;
  rows: LineRow[];
  onRowsChange: (rows: LineRow[]) => void;
  problems: LineProblems;
  onProblemsChange: (problems: LineProblems) => void;
  disabled: boolean;
}) {
  const fields = lineFields(setup);
  const totals = lineAmounts(fields);
  const label = setup.resource.label.toLowerCase();
  const nextKey = Math.max(-1, ...rows.map((row) => row.key)) + 1;
  // The rows as they are by the time a copied value comes back, not as they were when it was asked for.
  const latest = useRef(rows);
  latest.current = rows;

  function change(rowKey: number, field: string, value: string | boolean) {
    // A product picked: its price, for the cells that copy it. Laravel copies it again when the line is saved.
    const relation = setup.relations[field];
    const copies = relation ? fields.filter(([, def]) => copiedFrom(def)?.relation === field) : [];
    const picked = typeof value === "string" && value !== "" ? value : undefined;
    // Empty until the new one's answer comes: never the last product's price beside this one.
    const emptied = Object.fromEntries(copies.map(([key]) => [key, ""]));
    const next = rows.map((row) => (row.key === rowKey ? { ...row, values: { ...row.values, [field]: value, ...emptied } } : row));
    latest.current = next;
    onRowsChange(next);
    for (const [key, def] of picked && relation ? copies : []) {
      // A failed lookup leaves the cell empty: Laravel copies the price when the line is saved either way.
      void copiedValue(relation!.name, picked!, copiedFrom(def)!.field).catch(() => null).then((copy) => {
        // Only if the row still points at what was picked: a second pick's answer may come back first.
        const now = latest.current.map((row) => (row.key === rowKey && row.values[field] === picked ? { ...row, values: { ...row.values, [key]: copy === null ? "" : String(copy) } } : row));
        latest.current = now;
        onRowsChange(now);
      });
    }
    if (problems[rowKey]?.[field] || problems[rowKey]?.[""]) {
      const { [rowKey]: row = {}, ...rest } = problems;
      const { [field]: _fixed, "": _general, ...others } = row;
      onProblemsChange(Object.keys(others).length > 0 ? { ...rest, [rowKey]: others } : rest);
    }
  }

  function add() {
    onRowsChange([...rows, { key: nextKey, values: initialFormValues(setup.resource, null) as Values }]);
  }

  function remove(rowKey: number) {
    const left = rows.filter((row) => row.key !== rowKey);
    onRowsChange(left.length > 0 ? left : [{ key: nextKey, values: initialFormValues(setup.resource, null) as Values }]);
    const { [rowKey]: _gone, ...rest } = problems;
    onProblemsChange(rest);
  }

  const amounts = totals ? rows.map((row) => totals.amount(row.values)) : [];
  const grand = amounts.reduce<number>((sum, amount) => sum + (amount ?? 0), 0);

  return (
    <section aria-labelledby="line-items" className="flex flex-col gap-3 md:col-span-2">
      <h3 id="line-items" className="text-sm font-medium">
        {setup.resource.pluralLabel}
      </h3>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th scope="col" className="w-10 px-2 py-2 text-center font-medium">
                #
              </th>
              {fields.map(([key, def]) => (
                <th key={key} scope="col" className={cn("px-2 py-2 font-medium whitespace-nowrap", def.kind === "boolean" ? "w-24 text-center" : def.kind === "belongsTo" ? "min-w-56" : "min-w-28")}>
                  {def.label}
                  {def.required !== false && def.kind !== "boolean" && (
                    <span className="text-destructive" aria-label="required">
                      {" "}
                      *
                    </span>
                  )}
                </th>
              ))}
              {totals && (
                <th scope="col" className="px-2 py-2 text-right font-medium whitespace-nowrap">
                  Amount
                </th>
              )}
              <th scope="col" className="w-10">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const wrong = problems[row.key] ?? {};
              const messages = Object.entries(wrong).map(([field, message]) => {
                const name = fields.find(([key]) => key === field)?.[1].label;
                return name ? `${name}: ${message}` : message;
              });
              return (
                <tr key={row.key} className="border-t align-top">
                  <td className="px-2 py-3 text-center text-muted-foreground tabular-nums">{index + 1}</td>
                  {fields.map(([key, def]) => {
                    const value = row.values[key] ?? "";
                    const relation = setup.relations[key];
                    return (
                      <td key={key} className={cn("px-1.5 py-1.5", def.kind === "boolean" && "text-center")}>
                        {copiedFrom(def) ? (
                          // Not typed: it is what the line's product says, copied when the line is saved.
                          <p id={`line-${row.key}-${key}`} className="px-2 py-1.5 text-muted-foreground tabular-nums" title={`From the ${setup.relations[copiedFrom(def)!.relation]?.label.toLowerCase() ?? "record it points at"}`}>
                            {value === "" ? "—" : displayValue(def, Number(value))}
                          </p>
                        ) : (
                        <Cell
                          id={`line-${row.key}-${key}`}
                          resourceName={setup.resource.name}
                          fieldKey={key}
                          field={def}
                          label={`${def.label}, ${label} ${index + 1}`}
                          value={value}
                          invalid={Boolean(wrong[key])}
                          disabled={disabled}
                          relation={relation && { ...relation, initialTitle: typeof value === "string" ? setup.titles[key]?.[value] : undefined }}
                          onChange={(next) => change(row.key, key, next)}
                        />
                        )}
                        {key === fields[0]?.[0] && messages.length > 0 && (
                          <p role="alert" className="mt-1 w-max max-w-[60vw] text-left text-xs text-destructive">
                            {messages.join(" · ")}
                          </p>
                        )}
                      </td>
                    );
                  })}
                  {totals && <td className="px-2 py-3 text-right whitespace-nowrap tabular-nums">{amounts[index] === null ? "—" : totals.format(amounts[index]!)}</td>}
                  <td className="px-1 py-1.5">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${label} ${index + 1}`} disabled={disabled} onClick={() => remove(row.key)}>
                      <XIcon />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {totals && (
            <tfoot>
              <tr className="border-t font-medium">
                <td colSpan={fields.length + 1} className="px-2 py-2 text-right">
                  Total
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">{totals.format(grand)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div>
        <Button type="button" variant="outline" size="sm" disabled={disabled || rows.length >= MOST_ROWS} onClick={add}>
          <PlusIcon data-icon="inline-start" />
          Add {label}
        </Button>
      </div>
    </section>
  );
}
