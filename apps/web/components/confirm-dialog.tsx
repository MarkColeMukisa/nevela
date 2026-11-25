"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmIt, confirmWithPasskey, sendConfirmCode } from "@/lib/auth-client";
import type { ConfirmAsked } from "@/lib/confirm";

type Way = "password" | "email" | "totp";
type Result = { ok: boolean; confirm?: ConfirmAsked };

const ConfirmContext = createContext<((asked: ConfirmAsked) => Promise<boolean>) | null>(null);

/**
 * Asking someone to confirm it's them, when Laravel wants it before something that matters
 * (a refund marked sensitive, a change to who can sign in). Mounted once around the pages
 * that do such things.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [asked, setAsked] = useState<ConfirmAsked | null>(null);
  const settle = useRef<((confirmed: boolean) => void) | null>(null);

  const ask = useCallback(
    (question: ConfirmAsked) =>
      new Promise<boolean>((resolve) => {
        settle.current?.(false);
        settle.current = resolve;
        setAsked(question);
      }),
    [],
  );
  const finish = (confirmed: boolean) => {
    settle.current?.(confirmed);
    settle.current = null;
    setAsked(null);
  };

  return (
    <ConfirmContext value={ask}>
      {children}
      {asked ? <Ask key={asked.challenge} asked={asked} onDone={finish} /> : null}
    </ConfirmContext>
  );
}

/**
 * `confirmed(() => someAction(...))`: runs a server action, and if Laravel asks for a
 * confirmation first, asks the person and runs it again. What comes back is the action's
 * own answer, or its refusal if they didn't confirm.
 */
export function useConfirm() {
  const ask = useContext(ConfirmContext);
  return useCallback(
    async <T extends Result>(run: () => Promise<T>): Promise<T> => {
      const first = await run();
      if (first.ok || !first.confirm || !ask) return first;
      return (await ask(first.confirm)) ? run() : first;
    },
    [ask],
  );
}

function Ask({ asked, onDone }: { asked: ConfirmAsked; onDone: (confirmed: boolean) => void }) {
  const [way, setWay] = useState<Way>("password");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const answered = (result: { error: { message: string; status: number } | null }) => {
    if (!result.error) return onDone(true);
    // Too long, or too many tries: this question is over, and what they were doing can be tried again.
    if (result.error.status === 410 || result.error.status === 429) return onDone(false);
    setError(result.error.message);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    answered(await confirmIt(asked.challenge, way, value));
    setBusy(false);
  };

  const emailMe = async () => {
    setBusy(true);
    setError(null);
    const result = await sendConfirmCode(asked.challenge);
    setBusy(false);
    if (result.error) return setError(result.error.message);
    setWay("email");
    setValue("");
    setSent(true);
  };

  const passkey = async () => {
    setBusy(true);
    setError(null);
    answered(await confirmWithPasskey(asked.challenge));
    setBusy(false);
  };

  const switchTo = (next: Way) => {
    setWay(next);
    setValue("");
    setError(null);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onDone(false)}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Confirm it&apos;s you</DialogTitle>
            <DialogDescription>
              {asked.window ? "Changing who can sign in needs your password again. You won't be asked again for a few minutes." : "This needs your password again, for this one time."}
            </DialogDescription>
          </DialogHeader>
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          {sent && way === "email" ? <p role="status" className="text-sm text-muted-foreground">A code is on its way to your email.</p> : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-value">{way === "password" ? "Your password" : way === "email" ? "The code we emailed you" : "The code in your authenticator app"}</Label>
            <Input
              id="confirm-value"
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              {...(way === "password" ? { type: "password", autoComplete: "current-password" } : { inputMode: "numeric" as const, autoComplete: "one-time-code", maxLength: 6 })}
            />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {asked.methods.includes("passkey") ? (
              <button type="button" className="text-link hover:underline" disabled={busy} onClick={passkey}>
                Use a passkey
              </button>
            ) : null}
            {way !== "email" && asked.methods.includes("email") ? (
              <button type="button" className="text-link hover:underline" disabled={busy} onClick={emailMe}>
                Email me a code
              </button>
            ) : null}
            {way !== "totp" && asked.methods.includes("totp") ? (
              <button type="button" className="text-link hover:underline" disabled={busy} onClick={() => switchTo("totp")}>
                Use my authenticator app
              </button>
            ) : null}
            {way !== "password" ? (
              <button type="button" className="text-link hover:underline" disabled={busy} onClick={() => switchTo("password")}>
                Use my password
              </button>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onDone(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || value.trim() === ""}>
              Confirm
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
