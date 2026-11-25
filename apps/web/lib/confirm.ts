/**
 * Confirming it's you again, before something that matters. Laravel answers such a request
 * with 428 and a question (Auth\Confirmation); a server action passes it back as `confirm`,
 * and components/confirm-dialog.tsx asks the person, then runs the action again.
 */
export interface ConfirmAsked {
  error: string;
  challenge: string;
  methods: ("password" | "email" | "totp" | "passkey")[];
  /** A few minutes' window for this sign-in (changing who can sign in), rather than this one request. */
  window: boolean;
}

/** The question in a Laravel answer, when it is one. */
export function confirmAskedOf(response: { status: number; body: unknown }): ConfirmAsked | undefined {
  const body = response.body as Partial<ConfirmAsked> & { code?: unknown };
  if (response.status !== 428 || body?.code !== "CONFIRMATION_REQUIRED" || typeof body.challenge !== "string") return undefined;
  return { error: String(body.error ?? "Confirm it's you."), challenge: body.challenge, methods: Array.isArray(body.methods) ? body.methods : ["password"], window: body.window === true };
}
