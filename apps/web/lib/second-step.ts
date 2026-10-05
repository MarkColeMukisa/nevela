import { cookies } from "next/headers";

/**
 * A sign-in that is waiting for its second step.
 *
 * After a right password (or an emailed link or code) on an account with two-factor on,
 * Laravel hands back a challenge instead of a token. It is kept here, in an httpOnly
 * cookie, until the code arrives: the browser only ever sends the code, never the
 * challenge. Laravel forgets the challenge after the same ten minutes.
 */
export const PENDING_COOKIE = "nevela_2fa";
export const PENDING_MAX_AGE = 60 * 10;

/** The ways this sign-in can be finished, as Laravel names them. */
export type SecondStepMethod = "totp" | "email" | "backup";

export interface PendingSecondStep {
  challenge: string;
  methods: SecondStepMethod[];
}

export const encodePending = (pending: PendingSecondStep) => JSON.stringify({ c: pending.challenge, m: pending.methods });

export async function pendingSecondStep(): Promise<PendingSecondStep | null> {
  const raw = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { c?: unknown; m?: unknown };
    if (typeof parsed.c !== "string" || !parsed.c) return null;
    const methods = Array.isArray(parsed.m) ? parsed.m.filter((m): m is SecondStepMethod => m === "totp" || m === "email" || m === "backup") : [];
    return { challenge: parsed.c, methods };
  } catch {
    return null;
  }
}
