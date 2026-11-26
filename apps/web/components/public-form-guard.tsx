"use client";

import * as React from "react";
import type { PublicForm } from "@/hooks/use-public-form";

/** The part of Cloudflare's script this uses. */
interface Turnstile {
  render: (
    element: HTMLElement,
    options: { sitekey: string; action?: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void },
  ) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let loading: Promise<Turnstile> | null = null;

/** Cloudflare's script, asked for once however many forms a visit shows. */
function turnstile(): Promise<Turnstile> {
  const loaded = () => (window as unknown as { turnstile?: Turnstile }).turnstile;
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const existing = loaded();
    if (existing) return resolve(existing);
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const ready = loaded();
      if (ready) resolve(ready);
      else reject(new Error("Turnstile didn't load."));
    };
    script.onerror = () => {
      // Not kept: the next form to appear tries again.
      loading = null;
      script.remove();
      reject(new Error("Turnstile didn't load."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * The Turnstile widget on its own, for a form that asks for it only when Laravel says so,
 * such as the sign-in after several wrong passwords (`CAPTCHA_REQUIRED`). `onToken` gets each
 * answer, or null when it expires or fails; change `round` after every attempt, because an
 * answer is good once. With no NEXT_PUBLIC_TURNSTILE_SITE_KEY it shows nothing.
 */
export function TurnstileCheck({ action, onToken, round, className }: { action: string; onToken: (token: string | null) => void; round: number; className?: string }) {
  const holder = React.useRef<HTMLDivElement>(null);
  const widget = React.useRef<string | null>(null);
  const report = React.useRef(onToken);
  React.useEffect(() => {
    report.current = onToken;
  });

  React.useEffect(() => {
    if (SITE_KEY === "" || !holder.current) return;
    let current = true;
    let api: Turnstile | null = null;
    turnstile()
      .then((ready) => {
        if (!current || !holder.current) return;
        api = ready;
        widget.current = ready.render(holder.current, {
          sitekey: SITE_KEY,
          action,
          callback: (token) => report.current(token),
          "expired-callback": () => report.current(null),
          "error-callback": () => report.current(null),
        });
      })
      .catch(() => report.current(null));
    return () => {
      current = false;
      if (api && widget.current) api.remove(widget.current);
      widget.current = null;
    };
  }, [action]);

  React.useEffect(() => {
    if (round === 0 || !widget.current) return;
    (window as unknown as { turnstile?: Turnstile }).turnstile?.reset(widget.current);
    report.current(null);
  }, [round]);

  return SITE_KEY === "" ? null : <div ref={holder} className={className} />;
}

/**
 * What a protected form carries besides its own fields. Put it inside the form:
 *
 * ```tsx
 * <PublicFormGuard form={form} />
 * ```
 *
 * - The honeypot: a field a person never sees or reaches, and a bot fills in.
 * - The robot check (Cloudflare Turnstile), where the descriptor asks for it and
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. Its answer is good once, so it starts over
 *   after every attempt. With no site key there is no widget, and the form carries the
 *   honeypot and its token only.
 *
 * The form's token is the hook's to send. Nothing here is the check itself: Laravel
 * makes every one of them.
 */
export function PublicFormGuard({ form, className }: { form: PublicForm; className?: string }) {
  const { honeypot, turnstile: asked, action, attempt, robot } = form.guard;
  const holder = React.useRef<HTMLDivElement>(null);
  const widget = React.useRef<string | null>(null);
  const shown = asked && SITE_KEY !== "";

  // Rendered by hand, not by the script on load: moving between pages here doesn't reload
  // the document, so a widget the script found once would not be found again.
  React.useEffect(() => {
    if (!shown || !holder.current) return;
    let current = true;
    let api: Turnstile | null = null;
    turnstile()
      .then((ready) => {
        if (!current || !holder.current) return;
        api = ready;
        widget.current = ready.render(holder.current, {
          sitekey: SITE_KEY,
          // Which form this check is for. Laravel refuses a token solved for another.
          ...(action ? { action } : {}),
          callback: (token) => robot(token),
          "expired-callback": () => robot(null),
          "error-callback": () => robot(null),
        });
      })
      .catch(() => robot(null));
    return () => {
      current = false;
      if (api && widget.current) api.remove(widget.current);
      widget.current = null;
      robot(null);
    };
  }, [shown, action, robot]);

  // A used answer is refused the second time, so a corrected form needs a new one.
  React.useEffect(() => {
    if (attempt === 0 || !widget.current) return;
    const api = (window as unknown as { turnstile?: Turnstile }).turnstile;
    api?.reset(widget.current);
  }, [attempt]);

  React.useEffect(() => {
    if (asked && SITE_KEY === "" && process.env.NODE_ENV !== "production") {
      console.warn("This form asks for the robot check, and NEXT_PUBLIC_TURNSTILE_SITE_KEY isn't set, so no widget is shown and Laravel will refuse it.");
    }
  }, [asked]);

  return (
    <>
      {honeypot && (
        // Off the page, and out of the way of a keyboard and a screen reader. Not `hidden`
        // or display:none: a bot that skips those would skip this too.
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
          <label>
            Leave this empty
            <input type="text" name={honeypot} tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>
      )}
      {shown && <div ref={holder} className={className} />}
    </>
  );
}
