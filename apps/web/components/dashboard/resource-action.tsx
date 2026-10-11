"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArchiveIcon,
  BanIcon,
  BellIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  FlagIcon,
  LockIcon,
  MailIcon,
  MegaphoneIcon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  SendIcon,
  StarIcon,
  UnlockIcon,
  UploadIcon,
  XIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { field as build, type StoredField } from "@flaredev/core";
import { runResourceAction } from "@/app/dashboard/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import type { ActionField, ResourceAction } from "@/lib/extras";
import { FieldWidget } from "./fields/field-widget";

const ICONS: Record<string, LucideIcon> = {
  archive: ArchiveIcon,
  ban: BanIcon,
  bell: BellIcon,
  check: CheckIcon,
  copy: CopyIcon,
  download: DownloadIcon,
  flag: FlagIcon,
  lock: LockIcon,
  mail: MailIcon,
  megaphone: MegaphoneIcon,
  pause: PauseIcon,
  play: PlayIcon,
  refresh: RefreshCwIcon,
  send: SendIcon,
  star: StarIcon,
  unlock: UnlockIcon,
  upload: UploadIcon,
  x: XIcon,
};

/** The icon an action names, or a general one for "do something". */
export function actionIcon(name: string | undefined): LucideIcon {
  return (name && ICONS[name]) || ZapIcon;
}

/** What an action is run on: one record, the rows selected, or nothing in particular (the list as a whole). */
export interface ActionTarget {
  id?: string;
  ids?: string[];
}

const words = (key: string) => {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** A field an action asks for, as the form's widgets know fields. */
function widgetField(key: string, def: ActionField): StoredField & { label: string } {
  const options = { required: def.required !== false, ...(def.maxLength ? { maxLength: def.maxLength } : {}) };
  const made =
    def.kind === "enum"
      ? build.enum((def.options?.length ? def.options : [""]) as [string, ...string[]], { required: options.required })
      : def.kind === "string" && def.format === "email"
        ? build.email(options)
        : def.kind === "string" && def.format === "url"
          ? build.url(options)
          : def.kind === "string" && def.format === "tel"
            ? build.tel(options)
            : def.kind === "string"
              ? build.string(options)
              : def.kind === "text"
                ? build.text(options)
                : def.kind === "int"
                  ? build.int({ required: options.required })
                  : def.kind === "float"
                    ? build.float({ required: options.required })
                    : def.kind === "boolean"
                      ? build.boolean({ required: options.required })
                      : def.kind === "date"
                        ? build.date({ required: options.required })
                        : build.datetime({ required: options.required });
  return { ...made, label: def.label ?? words(key) } as StoredField & { label: string };
}

/** What the widgets hold while typing, as the API wants it: a number as a number, nothing as nothing. */
function asInput(fields: Record<string, ActionField>, values: Record<string, string | boolean>): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(fields)) {
    const value = values[key];
    if (def.kind === "boolean") input[key] = value === true;
    else if (value === undefined || value === "") continue;
    else if (def.kind === "int" || def.kind === "float") input[key] = Number(value);
    else input[key] = value;
  }
  return input;
}

/**
 * Running a resource's own actions from wherever their buttons are: a record's page, a
 * row's menu, beside New, the selection bar.
 *
 * `start` does what the action calls for first. One with something to fill in opens a
 * sheet; one with a question asks it, in the dialog Delete uses; one with neither runs.
 * Then the message its class returned is the toast, and the page is asked for again.
 * `dialogs` is the sheet and the dialog, to be rendered once by whoever holds the buttons.
 */
export function useResourceActions(resourceName: string, noun: string, onDone?: () => void) {
  const router = useRouter();
  const [current, setCurrent] = useState<{ action: ResourceAction; target: ActionTarget } | null>(null);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function run(action: ResourceAction, target: ActionTarget, input: Record<string, unknown>) {
    startTransition(async () => {
      const result = await runResourceAction(resourceName, action.key, target, input);
      if (result.ok) {
        toast.success(result.data.message);
        setCurrent(null);
        onDone?.();
        router.refresh();
        return;
      }
      const byField: Record<string, string> = {};
      for (const issue of result.issues ?? []) byField[issue.path] ??= issue.message;
      // A problem with something that was filled in is shown where it was filled in.
      if (action.fields && Object.keys(byField).some((key) => key in action.fields!)) {
        setIssues(byField);
        return;
      }
      toast.error(result.error);
      setCurrent(null);
      // It may have stopped applying while the page was open: show the page as it is now.
      if (result.status === 409 || result.status === 404) router.refresh();
    });
  }

  function start(action: ResourceAction, target: ActionTarget = {}) {
    setIssues({});
    setValues(Object.fromEntries(Object.entries(action.fields ?? {}).map(([key, def]) => [key, def.kind === "boolean" ? false : ""])));
    if (!action.fields && !action.confirm) run(action, target, {});
    else setCurrent({ action, target });
  }

  const action = current?.action;
  const count = current?.target.ids?.length;
  const asking = Boolean(action && !action.fields);
  const filling = Boolean(action?.fields);

  const dialogs = (
    <>
      <AlertDialog open={asking} onOpenChange={(open) => !open && !pending && setCurrent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{action?.label}</AlertDialogTitle>
            <AlertDialogDescription>
              {action?.confirm}
              {count ? ` This is for the ${count} ${noun} you selected.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button onClick={() => current && run(current.action, current.target, {})} disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {action?.label}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={filling} onOpenChange={(open) => !open && !pending && setCurrent(null)}>
        <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{action?.label}</SheetTitle>
            <SheetDescription>
              {action?.confirm ?? `Fill this in, then ${action?.label.toLowerCase()}.`}
              {count ? ` This is for the ${count} ${noun} you selected.` : ""}
            </SheetDescription>
          </SheetHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              if (current?.action.fields) run(current.action, current.target, asInput(current.action.fields, values));
            }}
          >
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
              {Object.entries(action?.fields ?? {}).map(([key, def]) => {
                const widget = widgetField(key, def);
                const id = `action-${action?.key}-${key}`;
                return (
                  <Field key={key} data-invalid={issues[key] ? true : undefined} orientation={def.kind === "boolean" ? "horizontal" : "vertical"}>
                    <FieldLabel htmlFor={id}>
                      {widget.label}
                      {def.required !== false && def.kind !== "boolean" && <span className="text-destructive"> *</span>}
                    </FieldLabel>
                    <FieldWidget
                      id={id}
                      name={key}
                      resourceName={resourceName}
                      fieldKey={key}
                      field={widget}
                      value={values[key] ?? ""}
                      onChange={(value) => setValues((before) => ({ ...before, [key]: value }))}
                      invalid={Boolean(issues[key])}
                      disabled={pending}
                    />
                    {issues[key] && <FieldError>{issues[key]}</FieldError>}
                  </Field>
                );
              })}
            </div>
            <SheetFooter className="flex-row justify-end border-t">
              <Button type="button" variant="outline" onClick={() => setCurrent(null)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Spinner data-icon="inline-start" />}
                {action?.label}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );

  return { start, pending, dialogs };
}

/**
 * Buttons for a resource's actions: on a record's page (with the record's id), or beside
 * New for actions on the list as a whole (with none).
 */
export function ActionButtons({ resourceName, noun, actions, id }: { resourceName: string; noun: string; actions: ResourceAction[]; id?: string }) {
  const { start, pending, dialogs } = useResourceActions(resourceName, noun);
  if (actions.length === 0) return null;
  return (
    <>
      {actions.map((action) => {
        const Icon = actionIcon(action.icon);
        return (
          <Button key={action.key} variant="outline" disabled={pending} onClick={() => start(action, id ? { id } : {})}>
            <Icon data-icon="inline-start" />
            {action.label}
          </Button>
        );
      })}
      {dialogs}
    </>
  );
}
