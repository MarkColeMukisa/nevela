"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent, type MouseEvent } from "react";
import { createValidators, formValuesToInput, initialFormValues, issuesByField, slugify, storedFields, type ClientResource, type StoredField } from "@flaredev/core";
import { toast } from "sonner";
import { createRecordAction, updateRecordAction } from "@/app/dashboard/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { copiedFrom } from "@/lib/copied";
import { filesOf } from "@/lib/files";
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
  // A field that doesn't apply (a billing cycle, on a one-off project) isn't asked for.
  const shown = fields.filter(([, def]) => applies(def, values));
  const shownKeys = shown.map(([key]) => key).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const steps = useMemo(() => toSteps(shown), [shownKeys]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
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

  function focusFirstError(fieldErrors: Record<string, string>, within: Entry[] = fields) {
    const first = within.find(([key]) => fieldErrors[key]);
    if (first) document.getElementById(`field-${first[0]}`)?.focus();
  }

  /** What is sent: the form's values, with the fields that don't apply empty. */
  function toInput(): Record<string, unknown> {
    const input = formValuesToInput(resource, values, mode) as Record<string, unknown>;
    for (const [key, def] of fields) {
      if (!applies(def, values)) input[key] = null;
    }
    return input;
  }

  /** Everything the descriptor objects to, whichever step it is on. */
  function validate(): Record<string, string> {
    const parsed = (mode === "create" ? validators.create : validators.update).safeParse(toInput());
    const found = parsed.success ? {} : issuesByField(parsed.error.issues);
    for (const [key, def] of fields) {
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
      const result = mode === "create" ? await createRecordAction(resource.name, input) : await updateRecordAction(resource.name, id!, input);
      if (result.ok) {
        toast.success(`${resource.label} ${mode === "create" ? "created" : "saved"}.`);
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
                    />
                  </div>
                  {def.helpText && <FieldDescription>{def.helpText}</FieldDescription>}
                  {copiedFrom(def) && <FieldDescription>Copied from the {relations[copiedFrom(def)!.relation]?.label.toLowerCase() ?? "record it points at"} when saved.</FieldDescription>}
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
            <Button key="submit" type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {mode === "create" ? `Create ${resource.label.toLowerCase()}` : "Save changes"}
            </Button>
          ) : (
            <Button key="next" type="button" onClick={next} disabled={pending}>
              Next
            </Button>
          )}
        </Footer>
      </Frame>
    </form>
  );
}

/** "2 items need fixing.", in the lines' own words. */
function linesNeedFixing(count: number, items: LineItemsSetup): string {
  return count === 1 ? `1 ${items.resource.label.toLowerCase()} needs fixing.` : `${count} ${items.resource.pluralLabel.toLowerCase()} need fixing.`;
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
