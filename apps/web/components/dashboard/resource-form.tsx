"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent, type MouseEvent } from "react";
import { createValidators, formValuesToInput, initialFormValues, issuesByField, slugify, storedFields, type ClientResource, type FormValues, type StoredField } from "@flaredev/core";
import { toast } from "sonner";
import { createRecordAction, updateRecordAction } from "@/app/dashboard/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { andList, mergeEdits, readable, savedSince } from "@/lib/conflict";
import { copiedFrom } from "@/lib/copied";
import { filesOf } from "@/lib/gallery";
import { jsonProblem } from "@/lib/json-field";
import { applies, conditionOf } from "@/lib/when";
import { canSuggest, suggestValue } from "@/lib/suggest";
import { cn } from "@/lib/utils";
import { FieldWidget, type RelationMeta } from "./fields/field-widget";
import { LineItems, linesToSend, problemsFromServer, startRows, type LineItemsSetup, type LineProblems, type LineRow } from "./line-items";

export interface ResourceFormProps {
  resource: ClientResource;
  mode: "create" | "edit";
  /** Record id (edit mode). */
  id?: string;
  record?: Record<string, unknown> | null;
  /** belongsTo field key → related resource metadata and the current value's title. */
  relations?: Record<string, RelationMeta & { initialTitle?: string }>;
  /** Where Cancel and a successful save go, when the form owns the page. */
  listHref: string;
  /** In a sheet: close it instead of navigating, and drop the card around the fields. */
  onDone?: () => void;
  /** Its lines, when it has some: edited below the fields, on the last step, and saved with it. */
  items?: LineItemsSetup;
}

const WIDE = new Set(["text", "file"]);

/**
 * More fields than this and the form is split into steps.
 *
 * Six inputs in one column is where a form starts to read as a chore rather than a
 * question, and a step at a time also means the first error appears before everything
 * else has been filled in.
 */
const FIELDS_PER_STEP = 5;

type Entry = [string, StoredField & { label: string }];

/** Fields in declaration order, cut into steps of at most {@link FIELDS_PER_STEP}. */
function toSteps(fields: Entry[]): Entry[][] {
  if (fields.length <= FIELDS_PER_STEP) return [fields];
  const steps: Entry[][] = [];
  for (let index = 0; index < fields.length; index += FIELDS_PER_STEP) {
    steps.push(fields.slice(index, index + FIELDS_PER_STEP));
  }
  return steps;
}

/**
 * Create/edit form rendered from field metadata. Values are validated in the browser
 * with the descriptor's zod schemas, then again on the server by the same store the
 * REST API uses; server errors (e.g. unique conflicts) land on their fields.
 */
export function ResourceForm({ resource, mode, id, record, relations = {}, listHref, onDone, items }: ResourceFormProps) {
  const router = useRouter();
  const validators = useMemo(() => createValidators(resource), [resource]);
  const fields = useMemo(() => storedFields(resource), [resource]);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(() => initialFormValues(resource, record));
  // The record as it was read, and its values: what is sent back as updatedAt, so a save
  // can't put back what someone else changed meanwhile, and what a merge starts from.
  const [base, setBase] = useState(() => ({ readAt: record?.updatedAt, values: initialFormValues(resource, record) }));
  // Someone else saved first: what of theirs came into the form, and where you both changed a field.
  const [conflict, setConflict] = useState<{ theirs: string[]; clashes: Record<string, string | boolean> } | null>(null);
  // A field that doesn't apply (a billing cycle, on a one-off project) isn't asked for.
  const shown = fields.filter(([, def]) => applies(def, values));
  const shownKeys = shown.map(([key]) => key).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const steps = useMemo(() => toSteps(shown), [shownKeys]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  // Fields with a file on its way: saved now, the record would go without it.
  const [uploading, setUploading] = useState<ReadonlySet<string>>(new Set());
  const busyChange = (key: string) => (busy: boolean) =>
    setUploading((current) => {
      const next = new Set(current);
      if (busy) next.add(key);
      else next.delete(key);
      return next;
    });
  const [lines, setLines] = useState<LineRow[]>(() => (items ? startRows(items) : []));
  const [lineProblems, setLineProblems] = useState<LineProblems>({});

  // A field that stops applying can take a step with it.
  const at = Math.min(step, steps.length - 1);
  const last = at === steps.length - 1;
  const visible = steps[at] ?? [];

  /**
   * Fields made from another (a slug from a title) and not yet typed in by hand. On a new
   * record they follow their source as it is typed, so what Laravel would make is on
   * show; once someone types in one, it is theirs. Never on an edit: a slug that is
   * already an address doesn't move.
   */
  const [following, setFollowing] = useState<Set<string>>(
    () => new Set(mode === "create" ? fields.filter(([, def]) => typeof (def as { from?: string }).from === "string").map(([key]) => key) : []),
  );

  const setValue = (key: string, value: string | boolean) => {
    setValues((current) => {
      const next = { ...current, [key]: value };
      for (const [made, def] of fields) {
        if (following.has(made) && (def as { from?: string }).from === key) next[made] = slugify(String(value));
      }
      return next;
    });
    if (following.has(key)) setFollowing((current) => new Set([...current].filter((made) => made !== key)));
    if (errors[key]) setErrors(({ [key]: _removed, ...rest }) => rest);
  };

  /** Their value for a field you both changed, taken instead of yours. */
  const takeTheirs = (key: string) => {
    const theirs = conflict?.clashes[key];
    if (theirs === undefined) return;
    setValue(key, theirs);
    setConflict((current) => current && { ...current, clashes: Object.fromEntries(Object.entries(current.clashes).filter(([field]) => field !== key)) });
  };

  function focusFirstError(fieldErrors: Record<string, string>, within: Entry[] = fields) {
    const first = within.find(([key]) => fieldErrors[key]);
    if (first) document.getElementById(`field-${first[0]}`)?.focus();
  }

  /** What is sent: the form's values, with the fields that don't apply empty. */
  function toInput(from: FormValues = values): Record<string, unknown> {
    const input = formValuesToInput(resource, from, mode) as Record<string, unknown>;
    for (const [key, def] of fields) {
      if (!applies(def, from)) input[key] = null;
    }
    return input;
  }

  /** Everything the descriptor objects to, whichever step it is on. */
  function validate(): Record<string, string> {
    const parsed = (mode === "create" ? validators.create : validators.update).safeParse(toInput());
    const found = parsed.success ? {} : issuesByField(parsed.error.issues);
    for (const [key, def] of fields) {
      if (def.kind === "json" && !filesOf(def)) {
        const text = String(values[key] ?? "").trim();
        const problem = text === "" ? null : jsonProblem(text);
        if (problem) found[key] = problem;
      }
      const when = conditionOf(def);
      if (!when) continue;
      if (!applies(def, values)) delete found[key];
      else if (when.required && !found[key] && String(values[key] ?? "").trim() === "") found[key] = "Required";
    }
    return found;
  }

  /**
   * Move on only when this step is right; problems further on can wait their turn.
   *
   * The click is cancelled first. This button and the submit button on the last step are
   * the same node to the browser, and React has already turned this one into the submit
   * button by the time the click's default action runs — without this, going to the last
   * step also saves the record.
   */
  function next(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    const found = validate();
    const here = Object.fromEntries(Object.entries(found).filter(([key]) => visible.some(([field]) => field === key)));
    if (Object.keys(here).length > 0) {
      setErrors(here);
      focusFirstError(here, visible);
      return;
    }
    setErrors({});
    setStep(Math.min(at + 1, steps.length - 1));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    // Enter in a field submits too: not while a file is still on its way.
    if (uploading.size > 0) return;
    const input = toInput();
    const found = validate();
    // Its lines go with it, checked with their own rules first.
    const send = items ? linesToSend(items, lines) : null;
    if (send) {
      input.items = send.items;
      setLineProblems(send.problems);
    }
    if (Object.keys(found).length > 0) {
      setErrors(found);
      // Send them to the step that holds the problem, not just to the field.
      const broken = steps.findIndex((entries) => entries.some(([key]) => found[key]));
      if (broken >= 0 && broken !== at) setStep(broken);
      focusFirstError(found, broken >= 0 ? steps[broken]! : fields);
      return;
    }
    if (send && Object.keys(send.problems).length > 0) {
      setErrors({ _form: linesNeedFixing(Object.keys(send.problems).length, items!) });
      return;
    }

    startTransition(async () => {
      let result = mode === "create" ? await createRecordAction(resource.name, input) : await updateRecordAction(resource.name, id!, withReadAt(input, base.readAt));
      // Someone else saved it first. Their changes come into the form beside yours; when
      // none of them meets one of yours, that is the save you meant, and it is sent again.
      // Once: saved again in between, it waits for you rather than going round.
      let from = base.values;
      let mine = values;
      let kept: string[] = [];
      for (let tries = 0; mode === "edit" && tries < 2; tries++) {
        const current = savedSince(result);
        if (!current) break;
        const theirs = initialFormValues(resource, current);
        const merged = mergeEdits(fields, from, mine, theirs);
        from = theirs;
        mine = merged.values;
        kept = [...new Set([...kept, ...merged.theirs])];
        setBase({ readAt: current.updatedAt, values: theirs });
        setValues(mine);
        if (Object.keys(merged.clashes).length > 0 || items || tries > 0) {
          setConflict({ theirs: kept, clashes: merged.clashes });
          setErrors({});
          const clashing = steps.findIndex((entries) => entries.some(([key]) => key in merged.clashes));
          if (clashing >= 0 && clashing !== at) setStep(clashing);
          return;
        }
        result = await updateRecordAction(resource.name, id!, withReadAt(toInput(mine), current.updatedAt));
      }
      if (result.ok) {
        const labels = kept.map((key) => fields.find(([field]) => field === key)?.[1].label ?? key);
        toast.success(`${resource.label} ${mode === "create" ? "created" : "saved"}.`, labels.length > 0 ? { description: `Someone else changed ${andList(labels)} meanwhile. That change is kept.` } : undefined);
        setConflict(null);
        if (onDone) onDone();
        else router.push(listHref);
        router.refresh();
        return;
      }
      // What Laravel says of the lines goes on their rows; the rest on the fields.
      const ofLines = (issue: { path: string }) => issue.path === "items" || issue.path.startsWith("items.");
      const lineIssues = result.issues?.filter(ofLines) ?? [];
      const issues = result.issues?.filter((issue) => !ofLines(issue)) ?? [];
      const onRows = send ? problemsFromServer(items!, send.sent, lineIssues) : {};
      setLineProblems(onRows);
      const whole = lineIssues.find((issue) => issue.path === "items");
      const fieldErrors =
        issues.length > 0
          ? issuesByField(issues)
          : result.field
            ? { [result.field]: result.error }
            : { _form: whole?.message ?? (Object.keys(onRows).length > 0 ? linesNeedFixing(Object.keys(onRows).length, items!) : result.error) };
      setErrors(fieldErrors);
      const broken = steps.findIndex((entries) => entries.some(([key]) => fieldErrors[key]));
      if (broken >= 0 && broken !== at) setStep(broken);
      focusFirstError(fieldErrors, broken >= 0 ? steps[broken]! : fields);
    });
  }

  const Frame = onDone ? SheetFrame : Card;
  const Body = onDone ? SheetBody : CardContent;
  const Footer = onDone ? SheetFooterRow : CardFooter;

  return (
    <form onSubmit={onSubmit} noValidate className={onDone ? "flex min-h-0 flex-1 flex-col" : undefined}>
      <Frame>
        {steps.length > 1 && <Steps count={steps.length} current={at} onGo={setStep} />}
        <Body>
          {errors._form && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{errors._form}</AlertDescription>
            </Alert>
          )}
          {conflict && <ConflictNotice resource={resource} fields={fields} conflict={conflict} lines={Boolean(items)} />}
          <FieldGroup className="grid gap-6 md:grid-cols-2">
            {visible.map(([key, def]) => {
              const error = errors[key];
              const widgetId = `field-${key}`;
              const horizontal = def.kind === "boolean";
              return (
                <Field key={key} data-invalid={error ? true : undefined} className={WIDE.has(def.kind) || filesOf(def) ? "md:col-span-2" : undefined}>
                  <FieldLabel htmlFor={widgetId}>
                    {def.label}
                    {(def.required || conditionOf(def)?.required) && def.kind !== "boolean" && (
                      <span className="ml-0.5 text-muted-foreground" aria-hidden>
                        *
                      </span>
                    )}
                  </FieldLabel>
                  <div className={horizontal ? "flex h-9 items-center" : undefined}>
                    <FieldWidget
                      id={widgetId}
                      name={key}
                      resourceName={resource.name}
                      fieldKey={key}
                      field={def}
                      value={values[key] ?? ""}
                      onChange={(value) => setValue(key, value)}
                      invalid={Boolean(error)}
                      disabled={pending || copiedFrom(def) !== undefined}
                      relation={relations[key]}
                      suggest={canSuggest(def) ? () => suggestValue(key, def, String(values[resource.titleField] ?? "")) : undefined}
                      // By spread: an app keeping its own field-widget.tsx from before has no such prop.
                      {...({ onBusyChange: busyChange(key) } as {})}
                    />
                  </div>
                  {def.helpText && <FieldDescription>{def.helpText}</FieldDescription>}
                  {copiedFrom(def) && <FieldDescription>Copied from the {relations[copiedFrom(def)!.relation]?.label.toLowerCase() ?? "record it points at"} when saved.</FieldDescription>}
                  {conflict && key in conflict.clashes && (
                    <FieldDescription className="text-warning">
                      {readable(def, conflict.clashes[key]!) === null ? "Someone else saved a different value." : `Someone else saved “${readable(def, conflict.clashes[key]!)}”.`}{" "}
                      <button type="button" className="font-medium underline underline-offset-4" onClick={() => takeTheirs(key)} disabled={pending}>
                        Use theirs
                      </button>
                    </FieldDescription>
                  )}
                  {error && <FieldError>{error}</FieldError>}
                </Field>
              );
            })}
            {items && last && <LineItems setup={items} rows={lines} onRowsChange={setLines} problems={lineProblems} onProblemsChange={setLineProblems} disabled={pending} />}
          </FieldGroup>
        </Body>
        <Footer className="flex items-center justify-end gap-2 border-t pt-4">
          {at > 0 ? (
            <Button type="button" variant="outline" onClick={() => setStep(at - 1)} disabled={pending}>
              Back
            </Button>
          ) : onDone ? (
            <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
              Cancel
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link href={listHref}>Cancel</Link>
            </Button>
          )}
          {last ? (
            <Button key="submit" type="submit" disabled={pending || uploading.size > 0}>
              {pending && <Spinner data-icon="inline-start" />}
              {uploading.size > 0 ? "Uploading…" : mode === "create" ? `Create ${resource.label.toLowerCase()}` : "Save changes"}
            </Button>
          ) : (
            <Button key="next" type="button" onClick={next} disabled={pending || uploading.size > 0}>
              Next
            </Button>
          )}
        </Footer>
      </Frame>
    </form>
  );
}

/** A change, sent with when its record was read: Laravel refuses it if someone else saved since. */
function withReadAt(input: Record<string, unknown>, readAt: unknown): Record<string, unknown> {
  return typeof readAt === "string" && readAt !== "" ? { ...input, updatedAt: readAt } : input;
}

/** "2 items need fixing.", in the lines' own words. */
function linesNeedFixing(count: number, items: LineItemsSetup): string {
  return count === 1 ? `1 ${items.resource.label.toLowerCase()} needs fixing.` : `${count} ${items.resource.pluralLabel.toLowerCase()} need fixing.`;
}

/** Someone else saved the record while it was open here: what came of it, and what is left to decide. */
function ConflictNotice({
  resource,
  fields,
  conflict,
  lines,
}: {
  resource: ClientResource;
  fields: Entry[];
  conflict: { theirs: string[]; clashes: Record<string, string | boolean> };
  lines: boolean;
}) {
  const label = (key: string) => fields.find(([field]) => field === key)?.[1].label ?? key;
  const clashes = Object.keys(conflict.clashes).map(label);
  return (
    <Alert className="mb-6 border-warning/50 bg-warning/10">
      <AlertDescription className="text-foreground">
        <p>
          Someone else saved this {resource.label.toLowerCase()} while you had it open.
          {conflict.theirs.length > 0 && ` Their change to ${andList(conflict.theirs.map(label))} is in the form now.`}
          {clashes.length > 0 && ` You both changed ${andList(clashes)}: yours is kept, with theirs beneath it.`}
          {lines && " The lines are as you left them, and saving keeps them that way."}
        </p>
        <p className="mt-1">Nothing of yours is saved yet. Save again when it looks right.</p>
      </AlertDescription>
    </Alert>
  );
}

/** Where you are in a multi-step form, and a way back to a step already passed. */
function Steps({ count, current, onGo }: { count: number; current: number; onGo: (step: number) => void }) {
  return (
    <div className="flex items-center gap-3 pb-4">
      <div className="flex flex-1 gap-1.5" role="presentation">
        {Array.from({ length: count }, (_, index) => (
          <button
            key={index}
            type="button"
            aria-label={`Step ${index + 1} of ${count}`}
            aria-current={index === current ? "step" : undefined}
            disabled={index > current}
            onClick={() => onGo(index)}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              index <= current ? "bg-primary" : "bg-muted",
              index < current && "cursor-pointer",
            )}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        Step {current + 1} of {count}
      </span>
    </div>
  );
}

/** Plain wrappers so the same form works in a page (a card) and in a sheet (no card). */
function SheetFrame({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col gap-4">{children}</div>;
}

function SheetBody({ children }: { children: React.ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto px-1">{children}</div>;
}

function SheetFooterRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}
