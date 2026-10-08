"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { createValidators, formValuesToInput, initialFormValues, issuesByField, storedFields, type ClientResource, type StoredField } from "@flaredev/core";
import { ListPlusIcon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { createManyAction } from "@/app/dashboard/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { FieldWidget, type RelationMeta } from "./fields/field-widget";

type FieldDef = StoredField & { label: string };
type Values = Record<string, string | boolean>;
type Relations = Record<string, RelationMeta & { initialTitle?: string }>;

interface Row {
  /** Stays with the row as others are added and removed around it. */
  key: number;
  values: Values;
}

/**
 * Enough to see that more can be added, and few enough not to look like a form to fill
 * in. An empty grid gives nothing to type into; one row means clicking "Add row" before
 * you have begun.
 */
const STARTING_ROWS = 5;

/** What Laravel accepts in one request (config/nevela.php, bulk_max). */
const MOST_ROWS = 500;

/** Kinds that fit in a cell: one control, one value. A file needs its own upload, so it is left to the form. */
const IN_A_CELL = new Set(["string", "text", "int", "float", "boolean", "date", "datetime", "enum", "belongsTo"]);

/**
 * Add several records at once, in a grid.
 *
 * Between "New" and "Import". Import is for a file somebody already has, and New is for
 * one record. This is for the twelve you have in your head or on a piece of paper, which
 * until now meant opening the form twelve times.
 *
 * Rows left empty are ignored, so nobody has to delete the ones they didn't use. The rows
 * that were filled in are saved together or not at all: Laravel checks every one first,
 * and a mistake comes back against its row with nothing created.
 */
export function BulkCreateButton({ resource, relations = {} }: { resource: ClientResource; relations?: Relations }) {
  const [open, setOpen] = useState(false);
  const plural = resource.pluralLabel.toLowerCase();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ListPlusIcon data-icon="inline-start" />
          Add several
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 sm:max-w-[min(96vw,84rem)]">
        <DialogHeader>
          <DialogTitle>Add several {plural}</DialogTitle>
          <DialogDescription>One row for each. Rows you leave empty are ignored, and they are all saved together or not at all.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so what was typed and abandoned last time is gone. */}
        {open && <Grid resource={resource} relations={relations} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Grid({ resource, relations, onDone }: { resource: ClientResource; relations: Relations; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const validators = useMemo(() => createValidators(resource), [resource]);
  const all = useMemo(() => storedFields(resource) as [string, FieldDef][], [resource]);
  const fields = useMemo(() => all.filter(([, def]) => IN_A_CELL.has(def.kind)), [all]);
  // A field this grid can't show and Laravel requires would fail every row, with nothing
  // on screen to fix. Say so, and leave those records to the form.
  const missing = useMemo(() => all.filter(([, def]) => !IN_A_CELL.has(def.kind) && def.required !== false), [all]);

  const blank = useMemo(() => initialFormValues(resource, null) as Values, [resource]);
  const nextKey = useRef(STARTING_ROWS);
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: STARTING_ROWS }, (_, key) => ({ key, values: { ...blank } })));
  /** Problems by row key, then by field. "" holds what isn't about one field. */
  const [problems, setProblems] = useState<Record<number, Record<string, string>>>({});
  const [error, setError] = useState<string | null>(null);

  // A row is empty when it is exactly as it started: a tick box left unticked is not an entry.
  const isEmpty = (values: Values) => fields.every(([key]) => values[key] === blank[key]);
  const filled = rows.filter((row) => !isEmpty(row.values));
  const noun = filled.length === 1 ? resource.label.toLowerCase() : resource.pluralLabel.toLowerCase();

  function change(rowKey: number, field: string, value: string | boolean) {
    setRows((current) => current.map((row) => (row.key === rowKey ? { ...row, values: { ...row.values, [field]: value } } : row)));
    if (problems[rowKey]?.[field]) {
      setProblems(({ [rowKey]: row = {}, ...rest }) => {
        const { [field]: _fixed, ...others } = row;
        return Object.keys(others).length > 0 ? { ...rest, [rowKey]: others } : rest;
      });
    }
  }

  function addRows(count: number) {
    setRows((current) => [...current, ...Array.from({ length: Math.min(count, MOST_ROWS - current.length) }, () => ({ key: nextKey.current++, values: { ...blank } }))]);
  }

  function removeRow(rowKey: number) {
    setRows((current) => (current.length > 1 ? current.filter((row) => row.key !== rowKey) : [{ key: nextKey.current++, values: { ...blank } }]));
    setProblems(({ [rowKey]: _gone, ...rest }) => rest);
  }

  function save() {
    setError(null);
    if (filled.length === 0) {
      setError("Nothing to create yet: every row is empty.");
      return;
    }
    // Checked here first with the descriptor's own rules, so most mistakes never leave the page.
    const found: Record<number, Record<string, string>> = {};
    const inputs = filled.map((row) => {
      const input = formValuesToInput(resource, row.values, "create") as Record<string, unknown>;
      const parsed = validators.create.safeParse(input);
      if (!parsed.success) {
        const visible = Object.fromEntries(Object.entries(issuesByField(parsed.error.issues)).filter(([key]) => fields.some(([field]) => field === key)));
        if (Object.keys(visible).length > 0) found[row.key] = visible;
      }
      // Only what the grid shows is sent; a field it can't show is left for Laravel to judge.
      return Object.fromEntries(Object.entries(input).filter(([key]) => fields.some(([field]) => field === key)));
    });
    if (Object.keys(found).length > 0) {
      setProblems(found);
      setError(Object.keys(found).length === 1 ? "One row needs fixing." : `${Object.keys(found).length} rows need fixing.`);
      return;
    }

    startTransition(async () => {
      const result = await createManyAction(resource.name, inputs);
      if (result.ok) {
        toast.success(`${result.data.created} ${result.data.created === 1 ? resource.label.toLowerCase() : resource.pluralLabel.toLowerCase()} created.`);
        onDone();
        router.refresh();
        return;
      }
      // Laravel numbers the rows it was sent, which are only the ones filled in. Here a
      // row is called by its number on screen, so every number it mentions is translated.
      const onScreen = (sent: number) => {
        const row = filled[sent - 1];
        return row ? rows.findIndex((candidate) => candidate.key === row.key) + 1 : sent;
      };
      const fromServer: Record<number, Record<string, string>> = {};
      const numbers: number[] = [];
      for (const problem of result.rows ?? []) {
        const row = filled[problem.row - 1];
        if (!row) continue;
        numbers.push(onScreen(problem.row));
        fromServer[row.key] = {};
        for (const issue of problem.issues) {
          const field = issue.path.split(".")[0] ?? "";
          const known = fields.some(([key]) => key === field);
          const label = all.find(([key]) => key === field)?.[1].label;
          const message = issue.message.replace(/\brow (\d+)\b/g, (_, sent: string) => `row ${onScreen(Number(sent))}`);
          // A problem with a field that has no column here is said beside the row instead.
          fromServer[row.key]![known ? field : ""] ??= known || !label ? message : `${label}: ${message}`;
        }
      }
      setProblems(fromServer);
      setError(numbers.length === 0 ? result.error : numbers.length === 1 ? `Nothing was created: row ${numbers[0]} needs fixing.` : `Nothing was created: ${numbers.length} rows need fixing.`);
    });
  }

  return (
    <>
      {missing.length > 0 && (
        <Alert>
          <AlertDescription>
            {missing.map(([, def]) => def.label).join(", ")} {missing.length === 1 ? "is" : "are"} required and can&apos;t be filled in here, so these rows would be
            refused. Use New {resource.label.toLowerCase()} for {resource.pluralLabel.toLowerCase()} instead.
          </AlertDescription>
        </Alert>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
            <tr>
              <th scope="col" className="w-10 px-2 py-2 text-center font-medium">
                #
              </th>
              {fields.map(([key, def]) => (
                <th key={key} scope="col" className={cn("px-2 py-2 font-medium whitespace-nowrap", def.kind === "boolean" ? "w-24 text-center" : "min-w-44")}>
                  {def.label}
                  {def.required !== false && def.kind !== "boolean" && (
                    <span className="text-destructive" aria-label="required">
                      {" "}
                      *
                    </span>
                  )}
                </th>
              ))}
              <th scope="col" className="w-10">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const wrong = problems[row.key] ?? {};
              const messages = Object.entries(wrong).map(([field, message]) => {
                const label = fields.find(([key]) => key === field)?.[1].label;
                return label ? `${label}: ${message}` : message;
              });
              return (
                <tr key={row.key} className="border-t align-top">
                  <td className="px-2 py-3 text-center text-muted-foreground tabular-nums">{index + 1}</td>
                  {fields.map(([key, def]) => (
                    <td key={key} className={cn("px-1.5 py-1.5", def.kind === "boolean" && "text-center")}>
                      <Cell
                        id={`bulk-${row.key}-${key}`}
                        resourceName={resource.name}
                        fieldKey={key}
                        field={def}
                        label={`${def.label}, row ${index + 1}`}
                        value={row.values[key] ?? ""}
                        invalid={Boolean(wrong[key])}
                        disabled={pending}
                        relation={relations[key]}
                        onChange={(value) => change(row.key, key, value)}
                      />
                      {/* Said under the cell it is about. One with no cell of its own goes under the first. */}
                      {key === fields[0]?.[0] && messages.length > 0 && (
                        <p role="alert" className="mt-1 w-max max-w-[60vw] text-left text-xs text-destructive">
                          {messages.join(" · ")}
                        </p>
                      )}
                    </td>
                  ))}
                  <td className="px-1 py-1.5">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove row ${index + 1}`} disabled={pending} onClick={() => removeRow(row.key)}>
                      <XIcon />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending || rows.length >= MOST_ROWS} onClick={() => addRows(1)}>
          <PlusIcon data-icon="inline-start" />
          Add row
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={pending || rows.length >= MOST_ROWS} onClick={() => addRows(5)}>
          Add 5 rows
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" disabled={pending} onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" disabled={pending || filled.length === 0 || missing.length > 0} onClick={save}>
          {pending && <Spinner />}
          {filled.length === 0 ? `Create ${resource.pluralLabel.toLowerCase()}` : `Create ${filled.length} ${noun}`}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * One cell. Long text is a single line here and a tick box is a tick box: a grid is for
 * typing across, and a four-line text area or a labelled switch in every row is neither
 * quick nor readable. Everything else is the form's own control, so a date, a price or a
 * link to another record behaves exactly as it does there.
 */
function Cell({
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
