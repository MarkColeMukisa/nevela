/**
 * The browser's side of signing in, with the method names Flare's screens call.
 *
 * In Flare these are Better Auth's client. Here each one is a request to this app's
 * `/api/auth/…` route, which passes it to Laravel and keeps the token in an httpOnly
 * cookie. So the screens are Flare's, unchanged, and the accounts, passwords, codes and
 * passkeys are Laravel's.
 *
 * Every method resolves to `{ data, error }` and never throws.
 */

export interface AuthError {
  message: string;
  code?: string;
  status: number;
}

export type AuthResult<T = Record<string, unknown>> = { data: T; error: null } | { data: null; error: AuthError };

async function call<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<AuthResult<T>> {
  try {
    const response = await fetch(`/api/auth/${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const parsed = (text ? JSON.parse(text) : {}) as Record<string, unknown>;
    if (!response.ok) {
      return { data: null, error: { message: String(parsed.error ?? "Something went wrong. Try again."), code: parsed.code as string | undefined, status: response.status } };
    }
    return { data: parsed as T, error: null };
  } catch {
    return { data: null, error: { message: "Can't reach the server. Check your connection and try again.", status: 0 } };
  }
}

const post = <T = Record<string, unknown>>(path: string, body: unknown = {}) => call<T>("POST", path, body);
const unsupported = async (what: string): Promise<AuthResult<never>> => ({ data: null, error: { message: `${what} isn't available in this app.`, code: "NOT_ENABLED", status: 404 } });

/* --- Passkeys: the browser's WebAuthn calls, with their binary fields as base64url text. --- */

const toBytes = (text: string): ArrayBuffer => {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

const toText = (buffer: ArrayBuffer | null | undefined): string => {
  if (!buffer) return "";
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

type Descriptor = { id: string; type: string; transports?: string[] };
type CreationOptions = { challenge: string; user: { id: string; name: string; displayName: string }; excludeCredentials?: Descriptor[] } & Record<string, unknown>;
type RequestOptions = { challenge: string; allowCredentials?: Descriptor[] } & Record<string, unknown>;

const descriptors = (list: Descriptor[] | undefined) => (list ?? []).map((item) => ({ ...item, id: toBytes(item.id) })) as PublicKeyCredentialDescriptor[];

const passkeyError = (cause: unknown, fallback: string): AuthError => {
  const name = cause instanceof DOMException ? cause.name : "";
  if (name === "NotAllowedError" || name === "AbortError") return { message: "The passkey prompt was closed before it finished.", code: "PASSKEY_CANCELLED", status: 0 };
  if (name === "InvalidStateError") return { message: "This device already has a passkey for your account.", code: "PASSKEY_EXISTS", status: 0 };
  if (name === "SecurityError") return { message: "Passkeys need this site to be on https, or on localhost.", code: "PASSKEY_UNAVAILABLE", status: 0 };
  return { message: fallback, code: "PASSKEY_FAILED", status: 0 };
};

/** One autofill request may be waiting at a time; a button press takes over from it. */
let autofill: AbortController | null = null;

async function signInWithPasskey({ autoFill = false }: { autoFill?: boolean } = {}): Promise<AuthResult> {
  if (typeof PublicKeyCredential === "undefined") return { data: null, error: { message: "This browser doesn't support passkeys.", code: "PASSKEY_UNAVAILABLE", status: 0 } };
  autofill?.abort();
  autofill = autoFill ? new AbortController() : null;

  const start = await post<{ challenge: string; options: RequestOptions }>("passkey/options");
  if (start.error) return start;
  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.get({
      publicKey: { ...start.data.options, challenge: toBytes(start.data.options.challenge), allowCredentials: descriptors(start.data.options.allowCredentials) } as PublicKeyCredentialRequestOptions,
      ...(autoFill ? { mediation: "conditional" as CredentialMediationRequirement, signal: autofill!.signal } : {}),
    })) as PublicKeyCredential | null;
  } catch (cause) {
    return { data: null, error: passkeyError(cause, "That passkey didn't work. Try again or use your email.") };
  }
  if (!credential) return { data: null, error: passkeyError(null, "No passkey was chosen.") };

  const answer = credential.response as AuthenticatorAssertionResponse;
  return post("passkey", {
    challenge: start.data.challenge,
    response: {
      id: credential.id,
      clientDataJSON: toText(answer.clientDataJSON),
      authenticatorData: toText(answer.authenticatorData),
      signature: toText(answer.signature),
      userHandle: toText(answer.userHandle),
    },
  });
}

async function addPasskey({ name }: { name?: string } = {}): Promise<AuthResult> {
  if (typeof PublicKeyCredential === "undefined") return { data: null, error: { message: "This browser doesn't support passkeys.", code: "PASSKEY_UNAVAILABLE", status: 0 } };
  const start = await post<{ challenge: string; options: CreationOptions }>("passkeys/options");
  if (start.error) return start;
  const options = start.data.options;
  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.create({
      publicKey: {
        ...options,
        challenge: toBytes(options.challenge),
        user: { ...options.user, id: toBytes(options.user.id) },
        excludeCredentials: descriptors(options.excludeCredentials),
      } as PublicKeyCredentialCreationOptions,
    })) as PublicKeyCredential | null;
  } catch (cause) {
    return { data: null, error: passkeyError(cause, "That passkey couldn't be added. Try again.") };
  }
  if (!credential) return { data: null, error: passkeyError(null, "No passkey was created.") };

  const answer = credential.response as AuthenticatorAttestationResponse;
  return post("passkeys", {
    challenge: start.data.challenge,
    name,
    response: {
      id: credential.id,
      clientDataJSON: toText(answer.clientDataJSON),
      attestationObject: toText(answer.attestationObject),
      transports: answer.getTransports?.() ?? [],
    },
  });
}

/* --- Sessions (devices) --- */

interface DeviceRow {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
  current: boolean;
}

export interface SessionUser {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  avatar: string | null;
  image: string | null;
}

export const authClient = {
  signIn: {
    /** With a second step set up, this resolves with `twoFactorRedirect` and the browser is sent to /two-factor. */
    async email({ email, password }: { email: string; password: string }) {
      const result = await post<{ twoFactorRedirect?: boolean }>("token", { email, password });
      if (result.data?.twoFactorRedirect) {
        const next = new URLSearchParams(window.location.search).get("next");
        window.location.href = `/two-factor${next ? `?next=${encodeURIComponent(next)}` : ""}`;
      }
      return result;
    },
    magicLink: ({ email, callbackURL }: { email: string; callbackURL?: string; errorCallbackURL?: string }) => post("magic-link", { email, next: callbackURL }),
    emailOtp: ({ email, otp }: { email: string; otp: string }) => post("email-code/verify", { email, code: otp }),
    passkey: signInWithPasskey,
    social: (_options: { provider: string; callbackURL?: string; errorCallbackURL?: string }) => unsupported("Signing in with that provider"),
  },
  signUp: {
    email: ({ name, email, password }: { name: string; email: string; password: string; callbackURL?: string }) =>
      post<{ verify?: boolean; user?: SessionUser }>("register", { name, email, password }),
  },
  signOut: () => call("DELETE", "token"),

  emailOtp: {
    sendVerificationOtp: ({ email, type }: { email: string; type: "sign-in" | "email-verification" | "forget-password" }) =>
      type === "sign-in" ? post("email-code", { email }) : post("email/send", { email }),
    verifyEmail: ({ email, otp }: { email: string; otp: string }) => post("email/verify", { email, code: otp }),
  },
  sendVerificationEmail: ({ email, callbackURL }: { email: string; callbackURL?: string }) => post("email/send", { email, next: callbackURL }),

  requestPasswordReset: ({ email }: { email: string; redirectTo?: string }) => post("password/forgot", { email }),
  resetPassword: ({ newPassword, token }: { newPassword: string; token: string }) => post("password/reset", { newPassword, token }),
  changePassword: (input: { currentPassword: string; newPassword: string; revokeOtherSessions?: boolean }) => post("password", input),

  /** `avatar` is the key of a picture uploaded with uploadAvatar(), or null to remove it. */
  updateUser: (input: { name?: string; avatar?: string | null }) => call<{ user: SessionUser }>("PATCH", "me", input),

  async getSession(): Promise<AuthResult<{ user: SessionUser; session: { token: string | null } }>> {
    const result = await call<{ user: SessionUser; session: { id: string | null } }>("GET", "me");
    if (result.error) return result;
    return { data: { user: result.data.user, session: { token: result.data.session?.id ?? null } }, error: null };
  },

  /** The devices signed in to this account. `token` identifies a row; it is not the token itself. */
  async listSessions() {
    const result = await call<{ data: DeviceRow[] }>("GET", "sessions");
    if (result.error) return result;
    return {
      data: result.data.data.map((row) => ({ id: row.id, token: row.id, userAgent: row.userAgent, ipAddress: row.ipAddress, updatedAt: row.lastUsedAt ?? row.createdAt ?? undefined, current: row.current })),
      error: null,
    };
  },
  revokeSession: ({ token }: { token: string }) => call("DELETE", `sessions/${encodeURIComponent(token)}`),
  revokeOtherSessions: () => call("DELETE", "sessions"),

  twoFactor: {
    /** `method: "totp"` starts an authenticator app's setup; `"otp"` switches on emailed codes. */
    enable: ({ password, method }: { password?: string; method?: "totp" | "otp" }) =>
      post<{ totpURI?: string; backupCodes: string[] }>("two-factor/enable", { password, method: method === "otp" ? "email" : "totp" }),
    disable: ({ password }: { password?: string }) => post("two-factor/disable", { password }),
    generateBackupCodes: ({ password }: { password?: string }) => post<{ backupCodes: string[] }>("two-factor/backup-codes", { password }),
    /**
     * A code from the authenticator app. While a sign-in is waiting for its second step it
     * completes that; otherwise it confirms the app that is being set up.
     */
    async verifyTotp({ code }: { code: string; trustDevice?: boolean }) {
      const waiting = await call<{ pending: boolean }>("GET", "two-factor/pending");
      return waiting.data?.pending ? post("two-factor/verify", { method: "totp", code }) : post("two-factor/confirm", { code });
    },
    sendOtp: () => post("two-factor/send"),
    verifyOtp: ({ code }: { code: string; trustDevice?: boolean }) => post("two-factor/verify", { method: "email", code }),
    verifyBackupCode: ({ code }: { code: string; trustDevice?: boolean }) => post("two-factor/verify", { method: "backup", code }),
  },

  passkey: {
    async listUserPasskeys() {
      const result = await call<{ data: { id: string; name: string | null; createdAt: string | null }[] }>("GET", "passkeys");
      return result.error ? result : { data: result.data.data, error: null };
    },
    addPasskey,
    deletePasskey: ({ id }: { id: string }) => call("DELETE", `passkeys/${encodeURIComponent(id)}`),
  },

  // Signing in with Google, GitHub and the like isn't part of Nevela yet.
  listAccounts: async (): Promise<AuthResult<{ id: string; providerId: string; accountId: string }[]>> => ({ data: [], error: null }),
  linkSocial: (_options: { provider: string; callbackURL?: string }) => unsupported("Connecting that provider"),
  unlinkAccount: (_options: { providerId?: string; accountId?: string }) => unsupported("Disconnecting that provider"),
};

/**
 * Upload a profile picture. It is the request body, so the browser can report progress,
 * and Laravel optimises it like any image field: a 400×400 square with a small thumbnail.
 */
export function uploadAvatar(file: File, onProgress?: (fraction: number) => void): Promise<AuthResult<{ user: SessionUser }>> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.upload.onprogress = (event) => onProgress?.(event.total ? event.loaded / event.total : 0);
    request.onload = () => {
      let answer: Record<string, unknown> = {};
      try {
        answer = JSON.parse(request.responseText) as Record<string, unknown>;
      } catch {
        // Not JSON: the status says what happened.
      }
      if (request.status >= 200 && request.status < 300) return resolve({ data: answer as { user: SessionUser }, error: null });
      resolve({ data: null, error: { message: String(answer.error ?? `The upload failed (${request.status}).`), code: answer.code as string | undefined, status: request.status } });
    };
    request.onerror = () => resolve({ data: null, error: { message: "The upload failed. Check your connection and try again.", status: 0 } });
    request.open("PUT", `/api/auth/avatar?name=${encodeURIComponent(file.name)}`);
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.send(file);
  });
}
