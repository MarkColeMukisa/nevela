"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createUserAction, updateUserAction, type UserInput } from "@/app/dashboard/access/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { ManagedRole, ManagedUser } from "@/lib/access";

const LIST = "/dashboard/access/users";

/**
 * Add someone, or change who they are and what they may do.
 *
 * A role is a box to tick. One that allows more than your own roles do can't be ticked:
 * you can only hand out what you hold, and Laravel refuses it if you try another way.
 */
export function UserForm({ user, roles }: { user?: ManagedUser; roles: ManagedRole[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(user?.active ?? true);
  const [held, setHeld] = useState<Set<string>>(() => new Set(user?.roles.map((role) => role.id) ?? []));
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string, on: boolean) {
    setHeld((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setIssues({});
    setError(null);
    const input: UserInput = { name: name.trim(), email: email.trim(), roles: [...held], active };
    if (password) input.password = password;

    startTransition(async () => {
      const result = user ? await updateUserAction(user.id, input) : await createUserAction(input);
      if (result.ok) {
        toast.success(user ? "Saved." : `${result.data.name ?? result.data.email} can sign in now.`);
        router.push(LIST);
        router.refresh();
        return;
      }
      const byField: Record<string, string> = {};
      for (const issue of result.issues ?? []) byField[issue.path.split(".")[0] ?? ""] ??= issue.message;
      setIssues(byField);
      // What isn't about one field (a rule about roles or administrators) goes above the buttons.
      if (Object.keys(byField).length === 0) setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} className="grid max-w-3xl gap-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who they are</CardTitle>
          <CardDescription>{user ? "Their name, and the address they sign in with." : "They sign in with this email and password straight away."}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={Boolean(issues.name)}>
              <FieldLabel htmlFor="user-name">Name</FieldLabel>
              <Input id="user-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" required aria-invalid={Boolean(issues.name)} />
              {issues.name && <FieldError>{issues.name}</FieldError>}
            </Field>
            <Field data-invalid={Boolean(issues.email)}>
              <FieldLabel htmlFor="user-email">Email</FieldLabel>
              <Input id="user-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" required aria-invalid={Boolean(issues.email)} />
              {issues.email && <FieldError>{issues.email}</FieldError>}
            </Field>
            <Field data-invalid={Boolean(issues.password)}>
              <FieldLabel htmlFor="user-password">{user ? "New password" : "Password"}</FieldLabel>
              <Input
                id="user-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required={!user}
                aria-invalid={Boolean(issues.password)}
              />
              <FieldDescription>
                {user
                  ? "Leave empty to keep the one they have. A new one signs them out everywhere and they are told by email."
                  : "At least 8 characters. They can change it from their account page."}
              </FieldDescription>
              {issues.password && <FieldError>{issues.password}</FieldError>}
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What they may do</CardTitle>
          <CardDescription>Someone with several roles may do everything any of them allows. With none, they reach their own account and nothing else.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {roles.map((role) => {
            const checked = held.has(role.id);
            // A role they already hold can always be taken away; one beyond yours can't be given.
            const locked = !role.withinYours && !checked;
            return (
              <label key={role.id} className="flex items-start gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 has-[[data-disabled]]:opacity-60">
                <Checkbox checked={checked} disabled={locked} onCheckedChange={(value) => toggle(role.id, value === true)} className="mt-0.5" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">{role.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {role.description || (role.isAdmin ? "Everything." : `${role.permissions.length} permission${role.permissions.length === 1 ? "" : "s"}.`)}
                    {locked && " It allows more than your own roles do, so it isn't yours to give."}
                  </span>
                </span>
              </label>
            );
          })}
          {issues.roles && <FieldError>{issues.roles}</FieldError>}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Field orientation="horizontal">
            <Switch id="user-active" checked={active} onCheckedChange={setActive} disabled={user?.isSelf} />
            <div className="flex flex-col gap-0.5">
              <FieldLabel htmlFor="user-active">Can sign in</FieldLabel>
              <FieldDescription>
                {user?.isSelf ? "You can't switch your own account off." : "Switched off, the account is kept and signed out everywhere, and can't sign in until it is switched on again."}
              </FieldDescription>
            </div>
          </Field>
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {user ? "Save" : "Add user"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href={LIST}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
