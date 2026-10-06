"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { createRoleAction, deleteRoleAction, updateRoleAction } from "@/app/dashboard/access/actions";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ManagedRole, PermissionCatalog, PermissionFeature } from "@/lib/access";

const LIST = "/dashboard/access/roles";
const ACTIONS = ["create", "view", "edit", "delete"] as const;
const ACTION_LABELS: Record<string, string> = { create: "Create", view: "View", edit: "Edit", delete: "Delete" };

/**
 * A role's name and what it allows.
 *
 * The grid is every permission there is: a row for each thing, a column for each action.
 * Three kinds of grant are understood here: one permission ("products.view"), everything
 * in a section including what is added to it later ("@resources.*"), and everything ("*").
 * Any other pattern a role was given (through the API, say) is kept as it is and shown,
 * never quietly rewritten.
 *
 * `mine` is what the person editing holds, or null for everything. A box they couldn't
 * grant is disabled, and Laravel refuses it whatever the browser sends.
 */
export function RoleForm({
  role,
  catalog,
  mine,
  canEdit,
  canDelete,
}: {
  role?: ManagedRole;
  catalog: PermissionCatalog;
  mine: string[] | null;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const moduleOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const section of catalog.modules) for (const group of section.groups) for (const feature of group.features) map.set(feature.key, section.key);
    return map;
  }, [catalog]);

  const granted = role?.grants ?? [];
  const everything = granted.includes("*");
  // The ADMIN role is everything, always. So is a role this person may not reshape.
  const locked = !canEdit || everything || (role !== undefined && !role.withinYours);

  const [whole, setWhole] = useState<Set<string>>(() => new Set(granted.filter((grant) => /^@[a-z_]+\.\*$/.test(grant)).map((grant) => grant.slice(1, -2))));
  // Patterns this screen has no switch for. Kept as they are, with what they come to.
  const [kept, setKept] = useState<string[]>(() => granted.filter((grant) => grant !== "*" && /[*@]/.test(grant) && !/^@[a-z_]+\.\*$/.test(grant)));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(granted.filter((grant) => !/[*@]/.test(grant))));
  // What the kept patterns came to when the page loaded: shown ticked, and not editable one by one.
  const byPattern = useMemo(() => {
    const direct = new Set(granted.filter((grant) => !/[*@]/.test(grant)));
    return new Set(kept.length > 0 ? (role?.permissions ?? []).filter((key) => !direct.has(key) && !whole.has(moduleOf.get(key.split(".")[0]!) ?? "")) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- worked out once, from the role as it was loaded
  }, [kept.length]);

  const holds = (key: string) => mine === null || mine.includes(key);
  const on = (key: string) => everything || whole.has(moduleOf.get(key.split(".")[0]!) ?? "") || byPattern.has(key) || picked.has(key);
  const fixed = (key: string) => locked || whole.has(moduleOf.get(key.split(".")[0]!) ?? "") || byPattern.has(key) || (!picked.has(key) && !holds(key));

  const total = catalog.total;
  const count = useMemo(() => {
    let n = 0;
    for (const section of catalog.modules) for (const group of section.groups) for (const feature of group.features) for (const action of feature.actions) if (on(`${feature.key}.${action}`)) n++;
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `on` reads exactly these
  }, [catalog, picked, whole, byPattern, everything]);

  function set(keys: string[], value: boolean) {
    setPicked((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (fixed(key)) continue;
        if (value) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  const keysOf = (feature: PermissionFeature) => feature.actions.map((action) => `${feature.key}.${action}`);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setIssues({});
    setError(null);
    // A permission already covered by a whole section doesn't need saying twice.
    const grants = everything
      ? ["*"]
      : [...[...whole].map((section) => `@${section}.*`), ...kept, ...[...picked].filter((key) => !whole.has(moduleOf.get(key.split(".")[0]!) ?? ""))];
    const input = { name: name.trim(), description: description.trim() || null, grants };

    startTransition(async () => {
      const result = role ? await updateRoleAction(role.id, role.isSystem ? { description: input.description, grants } : input) : await createRoleAction(input);
      if (result.ok) {
        toast.success(role ? "Saved. It applies from each person's next request." : `${result.data.name} is ready to give to people.`);
        router.push(LIST);
        router.refresh();
        return;
      }
      const byField: Record<string, string> = {};
      for (const issue of result.issues ?? []) byField[issue.path.split(".")[0] ?? ""] ??= issue.message;
      setIssues(byField);
      if (!byField.name && !byField.description) setError(byField.grants ?? result.error);
    });
  }

  function remove() {
    if (!role) return;
    startTransition(async () => {
      const result = await deleteRoleAction(role.id);
      if (result.ok) {
        toast.success(`${role.name} is deleted.`);
        router.push(LIST);
        router.refresh();
      } else {
        setConfirming(false);
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-6" noValidate>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base">The role</CardTitle>
          {role?.isSystem && <CardDescription>This role is built in. What it allows is yours to change; its name isn&apos;t, and it can&apos;t be deleted.</CardDescription>}
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={Boolean(issues.name)}>
              <FieldLabel htmlFor="role-name">Name</FieldLabel>
              <Input id="role-name" value={name} onChange={(event) => setName(event.target.value)} disabled={!canEdit || role?.isSystem} required maxLength={80} aria-invalid={Boolean(issues.name)} />
              {issues.name && <FieldError>{issues.name}</FieldError>}
            </Field>
            <Field data-invalid={Boolean(issues.description)}>
              <FieldLabel htmlFor="role-description">Description</FieldLabel>
              <Textarea id="role-description" value={description} onChange={(event) => setDescription(event.target.value)} disabled={!canEdit} rows={2} maxLength={500} />
              <FieldDescription>Shown wherever someone picks a role, so say who it is for.</FieldDescription>
              {issues.description && <FieldError>{issues.description}</FieldError>}
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-baseline gap-x-3 text-base">
            What it allows
            <span className="text-sm font-normal text-muted-foreground tabular-nums">
              {count} of {total} permissions
            </span>
          </CardTitle>
          <CardDescription>
            {everything
              ? "This role allows everything, including whatever is added to the app later. Make another role for less."
              : role && !role.withinYours
                ? "This role allows things your own roles don't, so it isn't yours to change."
                : "Tick what people with this role may do. Viewing is what makes something appear in the dashboard at all."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-8">
          {kept.length > 0 && (
            <div className="flex flex-col gap-2 rounded-md border border-dashed p-3 text-sm">
              <p>
                This role also has {kept.length === 1 ? "a pattern" : "patterns"} set outside this screen: <code>{kept.join(", ")}</code>. What{" "}
                {kept.length === 1 ? "it comes" : "they come"} to is ticked below and can&apos;t be changed one box at a time.
              </p>
              {!locked && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => {
                    // What they came to becomes ordinary ticks, and the patterns go.
                    setPicked((current) => new Set([...current, ...byPattern]));
                    setKept([]);
                  }}
                >
                  Turn into individual permissions
                </Button>
              )}
            </div>
          )}

          {catalog.modules.map((section) => {
            const wholeModule = everything || whole.has(section.key);
            const all = section.groups.flatMap((group) => group.features.flatMap(keysOf));
            return (
              <section key={section.key} className="flex flex-col gap-3" aria-labelledby={`section-${section.key}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 id={`section-${section.key}`} className="text-sm font-semibold">
                    {section.name}
                  </h3>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Switch
                      checked={wholeModule}
                      disabled={locked || !all.every(holds)}
                      onCheckedChange={(value) =>
                        setWhole((current) => {
                          const next = new Set(current);
                          if (value) next.add(section.key);
                          else next.delete(section.key);
                          return next;
                        })
                      }
                    />
                    Everything here, and whatever is added later
                  </label>
                </div>

                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                        <th scope="col" className="px-3 py-2 font-medium">
                          {section.groups.length === 1 ? section.groups[0]!.name : "Feature"}
                        </th>
                        {ACTIONS.map((action) => (
                          <th key={action} scope="col" className="w-20 px-2 py-2 text-center font-medium">
                            {ACTION_LABELS[action]}
                          </th>
                        ))}
                        <th scope="col" className="w-16 px-2 py-2 text-center font-medium">
                          All
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.groups.map((group) => (
                        <FeatureRows
                          key={group.key}
                          heading={section.groups.length > 1 ? group.name : null}
                          features={group.features}
                          on={on}
                          fixed={fixed}
                          set={set}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canEdit && !(role && !role.withinYours) && (
          <Button type="submit" disabled={pending}>
            {pending && <Spinner />}
            {role ? "Save" : "Create role"}
          </Button>
        )}
        <Button variant="ghost" asChild>
          <Link href={LIST}>{canEdit ? "Cancel" : "Back"}</Link>
        </Button>
        {role && canDelete && !role.isSystem && role.withinYours && (
          <Button type="button" variant="outline" className="ml-auto text-destructive" disabled={pending} onClick={() => setConfirming(true)}>
            Delete role
          </Button>
        )}
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {role?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {role && role.users > 0
                ? `${role.users === 1 ? "One person holds" : `${role.users} people hold`} this role. Give them another first: a role in use can't be deleted.`
                : "Nobody holds this role. Deleting it can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={pending || (role?.users ?? 0) > 0} onClick={remove}>
              {pending && <Spinner />}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function FeatureRows({
  heading,
  features,
  on,
  fixed,
  set,
}: {
  heading: string | null;
  features: PermissionFeature[];
  on: (key: string) => boolean;
  fixed: (key: string) => boolean;
  set: (keys: string[], value: boolean) => void;
}) {
  return (
    <>
      {heading && (
        <tr className="border-b bg-muted/20">
          <th scope="colgroup" colSpan={ACTIONS.length + 2} className="px-3 py-1.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {heading}
          </th>
        </tr>
      )}
      {features.map((feature) => {
        const keys = feature.actions.map((action) => `${feature.key}.${action}`);
        const every = keys.every(on);
        const some = keys.some(on);
        return (
          <tr key={feature.key} className="border-b last:border-b-0">
            <th scope="row" className="px-3 py-2 text-left font-normal">
              {feature.name}
            </th>
            {ACTIONS.map((action) => {
              const key = `${feature.key}.${action}`;
              return (
                <td key={action} className="px-2 py-2 text-center">
                  {feature.actions.includes(action) ? (
                    <Checkbox
                      aria-label={`${ACTION_LABELS[action]} ${feature.name.toLowerCase()}`}
                      checked={on(key)}
                      disabled={fixed(key)}
                      onCheckedChange={(value) => set([key], value === true)}
                    />
                  ) : (
                    <span className="text-muted-foreground" aria-hidden="true">
                      –
                    </span>
                  )}
                </td>
              );
            })}
            <td className="px-2 py-2 text-center">
              <Checkbox
                aria-label={`Everything for ${feature.name.toLowerCase()}`}
                checked={every ? true : some ? "indeterminate" : false}
                disabled={keys.every(fixed)}
                onCheckedChange={(value) => set(keys, value === true)}
              />
            </td>
          </tr>
        );
      })}
    </>
  );
}
