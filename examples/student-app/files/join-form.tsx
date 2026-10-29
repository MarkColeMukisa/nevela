"use client";

import { PublicFormGuard } from "@/components/public-form-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePublicForm } from "@/hooks/use-public-form";

/** The form itself: sent to /api/public/students, which saves the student unconfirmed and emails a link. */
export function JoinForm() {
  const form = usePublicForm("students");

  if (form.sent) {
    return <p className="mt-10 rounded-lg border border-border p-4">Thank you. We have emailed you a link: follow it to confirm your address.</p>;
  }

  return (
    <form onSubmit={form.submit} className="mt-10 flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Your name</Label>
        <Input id="name" name="name" autoComplete="name" required aria-invalid={Boolean(form.errors.name)} />
        {form.errors.name && <p className="text-sm text-destructive">{form.errors.name}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(form.errors.email)} />
        {form.errors.email && <p className="text-sm text-destructive">{form.errors.email}</p>}
      </div>
      <PublicFormGuard form={form} />
      {form.error && <p className="text-sm text-destructive">{form.error}</p>}
      <Button type="submit" disabled={form.pending}>
        {form.pending ? "Sending…" : "Sign up"}
      </Button>
    </form>
  );
}
