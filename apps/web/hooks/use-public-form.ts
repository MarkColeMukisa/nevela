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

/** What Laravel says when it refuses something. */
interface Refused {
  error?: string;
  issues?: { path?: string; message?: string }[];
}

export interface PublicForm {
  /** Give this to the form: `<form onSubmit={form.submit}>`. */
  submit: (event: React.FormEvent<HTMLFormElement>) => void;
  /** Being sent: its files first, then the form. */
  pending: boolean;
  /** The file field being uploaded right now, or null. */
  uploading: string | null;
  /** Sent, and taken. */
  sent: boolean;
  /** What went wrong, where it isn't about one field: the robot check, too many tries, no connection. */
  error: string | null;
  /** What is wrong with a field, by its name. */
  errors: Record<string, string>;
  /** Start again after a form was sent, to send another. */
  again: () => void;
  /**
   * Upload one file for a file field of this form, and get the key to send as its value.
   * `submit` does this for every file input in the form. It is here for a form that
   * builds its own values, or uploads as soon as a file is chosen.
   */
  upload: (field: string, file: File) => Promise<{ key: string } | { error: string }>;
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
  /**
   * The record to send, from the form's fields. By default each named field, as typed,
   * with empty ones left out, and for each file input the key of its uploaded file.
   * `uploaded` holds those keys by field name.
   */
  values?: (data: FormData, uploaded: Record<string, string>) => Record<string, unknown>;
  onSent?: () => void;
}

const UNREACHABLE = "That didn't send. Check your connection and try again.";

/** Whether two files are the same choice: an attempt that failed elsewhere doesn't upload it again. */
const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

/**
 * A form anyone can send: a resource's public create, with whatever its descriptor's
 * "protect" asks for.
 *
 * ```tsx
 * const form = usePublicForm("internship-applications");
 *
 * <form onSubmit={form.submit}>
 *   <input name="email" />
 *   {form.errors.email}
 *   <input name="cv" type="file" accept="application/pdf" />
 *   {form.errors.cv}
 *   <PublicFormGuard form={form} />
 *   <button disabled={form.pending}>{form.uploading ? "Uploading…" : "Send"}</button>
 *   {form.error}
 * </form>
 * ```
 *
 * It asks Laravel for the form's token when the form is shown and again after every
 * attempt, sends the fields with it, and sorts the answer: a problem with a field goes to
 * `errors` under that field's name, and anything else to `error`. The checks themselves
 * are Laravel's. Nothing here decides who is let through.
 *
 * A file input is sent in two steps, as Laravel wants it: the file first, to the form's
 * own upload address, and then its key as the field's value. The field's types and size
 * limit are Laravel's to enforce, and what it refuses is shown under the field. A file
 * that was uploaded is not uploaded again when the form fails for another reason.
 *
 * A resource with no "protect" works too: there is no token to fetch, and the form is
 * sent as it is.
 */
export function usePublicForm(slug: string, { values, onSent }: PublicFormOptions = {}): PublicForm {
  const [issued, setIssued] = React.useState<Issued | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const [pending, setPending] = React.useState(false);
  const [uploading, setUploading] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const robot = React.useRef<string | null>(null);
  const sending = React.useRef(false);
  /** Files already uploaded for this form and not yet used, by field. */
  const uploaded = React.useRef<Record<string, { file: File; key: string }>>({});

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

  const upload = React.useCallback(
    async (field: string, file: File): Promise<{ key: string } | { error: string }> => {
      try {
        const response = await fetch(`/api/public/${encodeURIComponent(slug)}/_uploads/${encodeURIComponent(field)}?name=${encodeURIComponent(file.name)}`, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream", Accept: "application/json" },
          body: file,
        });
        const answer = (await response.json().catch(() => null)) as (Refused & { key?: string }) | null;
        if (response.ok && typeof answer?.key === "string") return { key: answer.key };
        return { error: answer?.issues?.find((issue) => issue.message)?.message ?? answer?.error ?? "That file couldn't be uploaded." };
      } catch {
        return { error: UNREACHABLE };
      }
    },
    [slug],
  );

  const submit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (sending.current) return;
      const element = event.currentTarget;
      const data = new FormData(element);

      sending.current = true;
      setPending(true);
      setError(null);
      setErrors({});

      void (async () => {
        // The files first: each to its own field's address, for a key to send in its place.
        const keys: Record<string, string> = {};
        for (const [name, value] of data.entries()) {
          // An input nobody chose a file for is an empty file with no name.
          if (typeof value === "string" || value.size === 0) continue;
          const before = uploaded.current[name];
          if (before && sameFile(before.file, value)) {
            keys[name] = before.key;
            continue;
          }
          setUploading(name);
          const result = await upload(name, value);
          setUploading(null);
          if ("error" in result) {
            // Nothing was sent, so the form's token and the robot check are still good.
            setErrors({ [name]: result.error });
            return false;
          }
          uploaded.current[name] = { file: value, key: result.key };
          keys[name] = result.key;
        }

        const body: Record<string, unknown> = values ? { ...values(data, keys) } : { ...keys };
        if (!values) {
          for (const [name, value] of data.entries()) {
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

        try {
          const response = await fetch(`/api/public/${encodeURIComponent(slug)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(body),
          });
          if (response.ok) {
            // Its files belong to the record now.
            uploaded.current = {};
            element.reset();
            setSent(true);
            onSent?.();
            return true;
          }
          const answer = (await response.json().catch(() => null)) as Refused | null;
          const byField: Record<string, string> = {};
          const rest: string[] = [];
          for (const issue of answer?.issues ?? []) {
            if (!issue.message) continue;
            // The first thing wrong with a field is the one to fix first.
            if (issue.path && element.elements.namedItem(issue.path)) byField[issue.path] ??= issue.message;
            else rest.push(issue.path ? `${issue.path}: ${issue.message}` : issue.message);
          }
          // A file Laravel won't take as it is (used, or uploaded too long ago) is uploaded again next time.
          for (const name of Object.keys(byField)) delete uploaded.current[name];
          setErrors(byField);
          setError(Object.keys(byField).length > 0 && rest.length === 0 ? null : (rest[0] ?? answer?.error ?? UNREACHABLE));
        } catch {
          setError(UNREACHABLE);
        }
        return true;
      })()
        // (A `values` of the form's own that throws: nothing was sent.)
        .catch(() => {
          setError(UNREACHABLE);
          return false;
        })
        .then((attempted) => {
        sending.current = false;
        setUploading(null);
        setPending(false);
        if (attempted) {
          robot.current = null;
          // Whatever Laravel said, the next attempt needs a new token and a new robot check.
          setAttempt((count) => count + 1);
        }
      });
    },
    [slug, issued, values, onSent, upload],
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

  return { submit, pending, uploading, sent, error, errors, again, upload, guard };
}
