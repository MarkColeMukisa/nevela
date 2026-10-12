"use client";

import * as React from "react";

/** What Laravel hands a protected form before it is shown: GET /api/public/_nevela/form/<slug>. */
interface Issued {
  token: string | null;
  honeypot: string | null;
  minSeconds: number;
  turnstile: boolean;
  /** The name the robot check is made under. Cloudflare returns it, and Laravel checks it is this form's. */
  action?: string | null;
}

export interface PublicForm {
  /** Give this to the form: `<form onSubmit={form.submit}>`. */
  submit: (event: React.FormEvent<HTMLFormElement>) => void;
  /** Being sent. */
  pending: boolean;
  /** Sent, and taken. */
  sent: boolean;
  /** What went wrong, where it isn't about one field: the robot check, too many tries, no connection. */
  error: string | null;
  /** What is wrong with a field, by its name. */
  errors: Record<string, string>;
  /** Start again after a form was sent, to send another. */
  again: () => void;
  /** For `<PublicFormGuard form={form} />`. Not for the form itself to read. */
  guard: {
    honeypot: string | null;
    turnstile: boolean;
    action: string | null;
    /** Goes up after every attempt: a robot token is good once, so the widget starts over. */
    attempt: number;
    robot: (token: string | null) => void;
  };
}

export interface PublicFormOptions {
  /** The record to send, from the form's fields. By default each named field, as typed, with empty ones left out. */
  values?: (data: FormData) => Record<string, unknown>;
  onSent?: () => void;
}

const UNREACHABLE = "That didn't send. Check your connection and try again.";

/**
 * A form anyone can send: a resource's public create, with whatever its descriptor's
 * "protect" asks for.
 *
 * ```tsx
 * const form = usePublicForm("contact-messages");
 *
 * <form onSubmit={form.submit}>
 *   <input name="email" />
 *   {form.errors.email}
 *   <PublicFormGuard form={form} />
 *   <button disabled={form.pending}>Send</button>
 *   {form.error}
 * </form>
 * ```
 *
 * It asks Laravel for the form's token when the form is shown and again after every
 * attempt, sends the fields with it, and sorts the answer: a problem with a field goes to
 * `errors` under that field's name, and anything else to `error`. The checks themselves
 * are Laravel's. Nothing here decides who is let through.
 *
 * A resource with no "protect" works too: there is no token to fetch, and the form is
 * sent as it is.
 */
export function usePublicForm(slug: string, { values, onSent }: PublicFormOptions = {}): PublicForm {
  const [issued, setIssued] = React.useState<Issued | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const robot = React.useRef<string | null>(null);
  const sending = React.useRef(false);

  // The token says when the form was handed out, so it is asked for when the form
  // appears, and a fresh one after each attempt.
  React.useEffect(() => {
    let current = true;
    fetch(`/api/public/_nevela/form/${encodeURIComponent(slug)}`, { cache: "no-store", headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? (response.json() as Promise<Issued>) : null))
      .then((form) => {
        if (current) setIssued(form);
      })
      .catch(() => {
        if (current) setIssued(null);
      });
    return () => {
      current = false;
    };
  }, [slug, attempt]);

  const setRobot = React.useCallback((token: string | null) => {
    robot.current = token;
  }, []);

  const submit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (sending.current) return;
      const element = event.currentTarget;
      const data = new FormData(element);
      const body: Record<string, unknown> = values ? { ...values(data) } : {};
      if (!values) {
        for (const [name, value] of data.entries()) {
          // A file is uploaded on its own, and its key sent here: see the public uploads route.
          if (typeof value === "string" && value !== "") body[name] = value;
        }
      }
      // The field no person sees goes as it is, whatever `values` kept: it is how a bot is known.
      if (issued?.honeypot) {
        const bait = data.get(issued.honeypot);
        if (typeof bait === "string" && bait !== "") body[issued.honeypot] = bait;
      }
      if (issued?.token) body._form = issued.token;
      if (robot.current) body._turnstile = robot.current;

      sending.current = true;
      setPending(true);
      setError(null);
      setErrors({});
      fetch(`/api/public/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      })
        .then(async (response) => {
          if (response.ok) {
            element.reset();
            setSent(true);
            onSent?.();
            return;
          }
          const answer = (await response.json().catch(() => null)) as { error?: string; issues?: { path?: string; message?: string }[] } | null;
          const byField: Record<string, string> = {};
          const rest: string[] = [];
          for (const issue of answer?.issues ?? []) {
            if (!issue.message) continue;
            // The first thing wrong with a field is the one to fix first.
            if (issue.path && element.elements.namedItem(issue.path)) byField[issue.path] ??= issue.message;
            else rest.push(issue.path ? `${issue.path}: ${issue.message}` : issue.message);
          }
          setErrors(byField);
          setError(Object.keys(byField).length > 0 && rest.length === 0 ? null : (rest[0] ?? answer?.error ?? UNREACHABLE));
        })
        .catch(() => setError(UNREACHABLE))
        .finally(() => {
          sending.current = false;
          robot.current = null;
          setPending(false);
          // Whatever happened, the next attempt needs a new token and a new robot check.
          setAttempt((count) => count + 1);
        });
    },
    [slug, issued, values, onSent],
  );

  const again = React.useCallback(() => {
    setSent(false);
    setError(null);
    setErrors({});
  }, []);

  const guard = React.useMemo(
    () => ({ honeypot: issued?.honeypot ?? null, turnstile: issued?.turnstile ?? false, action: issued?.action ?? null, attempt, robot: setRobot }),
    [issued, attempt, setRobot],
  );

  return { submit, pending, sent, error, errors, again, guard };
}
