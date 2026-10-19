"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/auth-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";

/**
 * Signs an unattended dashboard out, as Grit's SessionWatchdog does.
 *
 * After NEXT_PUBLIC_SESSION_IDLE_MS (14 min 30 s) with no mouse, keyboard, touch or
 * wheel, a dialog counts down NEXT_PUBLIC_SESSION_COUNTDOWN_MS (30 s) and signs out:
 * 15 minutes, the life of an access token. Moving the mouse while it counts doesn't
 * dismiss it; "Stay signed in" does. Activity in another tab of the dashboard counts as
 * activity here, and signing out in one tab signs out the others. Set
 * NEXT_PUBLIC_SESSION_IDLE_MS=0 to switch it off.
 */
const IDLE_MS = Number(process.env.NEXT_PUBLIC_SESSION_IDLE_MS ?? 14 * 60 * 1000 + 30 * 1000);
const COUNTDOWN_MS = Number(process.env.NEXT_PUBLIC_SESSION_COUNTDOWN_MS ?? 30 * 1000);
const ACTIVITY = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"] as const;
/** How often the time since the last activity is looked at: the dialog opens at most this late. */
const CHECK_EVERY_MS = 5 * 1000;
/** How often one tab tells the others it is in use. */
const TELL_EVERY_MS = 5 * 1000;
const CHANNEL = "nevela-session";

type Message = { type: "active"; at: number } | { type: "signed-out" };

const here = () => window.location.pathname + window.location.search;

export function SessionWatchdog() {
  const enabled = Number.isFinite(IDLE_MS) && IDLE_MS > 0;
  const countdown = Number.isFinite(COUNTDOWN_MS) && COUNTDOWN_MS > 0 ? COUNTDOWN_MS : 30 * 1000;
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lastActivity = useRef(Date.now());
  const lastTold = useRef(0);
  const open = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const leaving = useRef(false);

  const signOut = useCallback(async (tellOthers: boolean) => {
    if (leaving.current) return;
    leaving.current = true;
    if (tellOthers) channel.current?.postMessage({ type: "signed-out" } satisfies Message);
    try {
      await signOutAction();
    } finally {
      window.location.assign(`/sign-in?reason=inactive&next=${encodeURIComponent(here())}`);
    }
  }, []);

  const close = useCallback(() => {
    open.current = false;
    setDeadline(null);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    channel.current = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
    channel.current?.addEventListener("message", (event: MessageEvent<Message>) => {
      if (event.data?.type === "active") {
        lastActivity.current = Math.max(lastActivity.current, event.data.at);
        // Someone is working in another tab: they are here, so this one needn't ask.
        if (open.current) close();
      } else if (event.data?.type === "signed-out") {
        void signOut(false);
      }
    });

    // Activity writes a number and nothing more: mousemove fires dozens of times a second.
    // While the dialog is open it is ignored here, so wiggling the mouse doesn't dismiss it.
    const onActivity = () => {
      if (open.current) return;
      const at = Date.now();
      lastActivity.current = at;
      if (at - lastTold.current > TELL_EVERY_MS) {
        lastTold.current = at;
        channel.current?.postMessage({ type: "active", at } satisfies Message);
      }
    };
    for (const name of ACTIVITY) window.addEventListener(name, onActivity, { passive: true });

    const check = setInterval(() => {
      if (open.current) return;
      const idle = Date.now() - lastActivity.current;
      if (idle < IDLE_MS) return;
      // Asleep through the whole countdown (a laptop closed): the sign-in ended while nobody was here.
      if (idle >= IDLE_MS + countdown) {
        void signOut(true);
        return;
      }
      open.current = true;
      setNow(Date.now());
      setDeadline(Date.now() + countdown);
    }, CHECK_EVERY_MS);

    return () => {
      for (const name of ACTIVITY) window.removeEventListener(name, onActivity);
      clearInterval(check);
      channel.current?.close();
      channel.current = null;
    };
  }, [enabled, countdown, close, signOut]);

  // The countdown, from a deadline rather than by counting ticks, so a tab the browser
  // slowed down in the background still signs out on time.
  useEffect(() => {
    if (deadline === null) return;
    const tick = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= deadline) {
        clearInterval(tick);
        void signOut(true);
      }
    }, 250);
    return () => clearInterval(tick);
  }, [deadline, signOut]);

  const stay = async () => {
    // Counted as activity before the dialog closes, so the check can't open it again at once.
    lastActivity.current = Date.now();
    close();
    channel.current?.postMessage({ type: "active", at: lastActivity.current } satisfies Message);
    const response = await fetch("/api/auth/refresh", { method: "POST" }).catch(() => null);
    if (response?.status === 401) window.location.assign(`/sign-in?reason=signed-out&next=${encodeURIComponent(here())}`);
  };

  if (!enabled) return null;
  const remaining = deadline === null ? countdown : Math.max(0, deadline - now);
  const seconds = Math.ceil(remaining / 1000);

  return (
    <AlertDialog open={deadline !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Still there?</AlertDialogTitle>
          <AlertDialogDescription>
            For your security you&apos;ll be signed out in <span className="font-semibold text-foreground tabular-nums">{seconds} s</span>, after a while with no activity.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Progress value={(remaining / countdown) * 100} aria-label="Time left before signing out" />
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => void signOut(true)}>Sign out</AlertDialogCancel>
          <AlertDialogAction autoFocus onClick={() => void stay()}>
            Stay signed in
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
