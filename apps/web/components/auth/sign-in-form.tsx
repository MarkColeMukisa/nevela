"use client";

import { useState } from "react";
import { signInAction } from "@/app/auth-actions";
import { AuthInput, AuthLabel, FormMessage, PrimaryButton } from "./ui";

/** Email and password, checked by Laravel. */
export function SignInForm({ next, initialError }: { next: string; initialError?: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await signInAction(email, password);
    if (result.ok) {
      window.location.href = next;
      return;
    }
    setError(result.error);
    setPending(false);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <div className="flex flex-col gap-1.5">
        <AuthLabel htmlFor="email">Email</AuthLabel>
        <AuthInput id="email" type="email" autoComplete="email" required autoFocus value={email} onChange={(event) => setEmail(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <AuthLabel htmlFor="password">Password</AuthLabel>
        <AuthInput
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <PrimaryButton type="submit" pending={pending}>
        Sign in
      </PrimaryButton>
    </form>
  );
}
