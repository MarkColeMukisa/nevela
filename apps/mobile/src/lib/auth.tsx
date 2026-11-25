import * as Device from "expo-device";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform } from "react-native";

import { api, type TokenPair } from "./api";
import { forgetPush } from "./push";
import { shellFor, type Shell } from "./shell";
import { authorize } from "./social";

/** The signed-in user, as `GET auth/me` describes them. */
export interface User {
  id: string;
  name: string | null;
  email: string | null;
  roles: string[];
  /** Everything they may do, such as "products.create". Laravel still decides each request. */
  permissions: string[];
  isAdmin: boolean;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  /** A small picture, ready to show, or null. */
  image: string | null;
}

export type SecondStepMethod = "totp" | "email" | "backup";

/** A sign-in whose first step passed and whose second is still owed. */
export interface Challenge {
  challenge: string;
  methods: SecondStepMethod[];
}

/** Which ways of signing in the API has switched on (`GET auth/config`). */
export interface SignInMethods {
  emailCode: boolean;
  /** Whether people may create their own account. */
  registration: boolean;
  /** Whether a new account must prove its email before it can sign in. */
  requireEmailVerification: boolean;
  /** The social providers that are switched on and have their keys, such as "google". */
  social: string[];
  /** The role someone who signs up starts with: what tells a customer from staff. */
  defaultRole: string | null;
}

type SignedIn = TokenPair & { user: User };
type Answer = SignedIn | { twoFactor: true; challenge: string; methods: SecondStepMethod[] };

/** What creating an account came to: signed in (null), a code to enter first ("verify"), or a second step owed. */
export type Registered = "verify" | Challenge | null;

interface AuthContextValue {
  user: User | null;
  /** True until the stored sign-in has been checked on launch. */
  loading: boolean;
  /** Which app this person is given, by their roles: see lib/shell.ts. */
  shell: Shell;
  /** Sign in with a password. Answers a challenge when the account has a second step. */
  signIn: (email: string, password: string) => Promise<Challenge | null>;
  /** Finish a sign-in that is waiting for its second step. */
  verifySecondStep: (challenge: string, method: SecondStepMethod, code: string) => Promise<void>;
  /** Email the second step's code. */
  sendSecondStepCode: (challenge: string) => Promise<void>;
  /** Email a sign-in code to an address. */
  sendEmailCode: (email: string) => Promise<void>;
  /** Sign in with an emailed code. Answers a challenge when the account has an authenticator app. */
  signInWithCode: (email: string, code: string) => Promise<Challenge | null>;
  /**
   * Sign in with Google or another provider, in the phone's browser. Answers a challenge when
   * the account has a second step. Where the API allows sign-up, a new address gets an account.
   */
  signInWithProvider: (provider: string) => Promise<Challenge | null>;
  /** Create an account. Answers "verify" when the email has to be proved before signing in. */
  register: (name: string, email: string, password: string) => Promise<Registered>;
  /** Prove an email with the code that was sent to it, which signs the new account in. */
  verifyEmail: (email: string, code: string) => Promise<Challenge | null>;
  /** Send the verification code again. */
  resendVerification: (email: string) => Promise<void>;
  /** Email a code to choose a new password with. Answers the same whether or not the address has an account. */
  forgotPassword: (email: string) => Promise<void>;
  /** Choose a new password with the emailed code. Every sign-in the account had is ended. */
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Read the user again, after a change to the profile. */
  reload: () => Promise<void>;
  /** Whether the user holds a permission, such as "users.view". */
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** How this device is listed under Settings → Devices, on every device the person uses. */
function deviceName(): string {
  if (Platform.OS === "web") return "Mobile app (web preview)";
  return Device.deviceName ?? Device.modelName ?? (Platform.OS === "ios" ? "iPhone" : "Android phone");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [defaultRole, setDefaultRole] = useState<string | null>(null);
  const shell = useMemo(() => shellFor(user, defaultRole), [user, defaultRole]);
  const userId = user?.id ?? null;

  // The role was asked for as the app opened. If that didn't get an answer (no signal, a slow
  // first request), ask again once someone is signed in, so a customer isn't left in the staff app.
  useEffect(() => {
    if (userId === null || defaultRole !== null) return;
    let live = true;
    signInMethods().then((methods) => {
      if (live) setDefaultRole(methods.defaultRole);
    });
    return () => {
      live = false;
    };
  }, [userId, defaultRole]);

  // Counts every sign-in and sign-out. An answer about "who am I" that set out before
  // the latest one is about a sign-in that is no longer this one, and is dropped.
  const era = useRef(0);

  const reload = useCallback(async () => {
    const asked = era.current;
    const { user: me } = await api.get<{ user: User }>("/auth/me");
    if (asked === era.current) setUser(me);
  }, []);

  const forget = useCallback(() => {
    era.current += 1;
    setUser(null);
  }, []);

  useEffect(() => {
    api.onSignedOut(forget);
    // Which role customers start with decides the first screen, so it is known before one is shown.
    const config = signInMethods().then((methods) => setDefaultRole(methods.defaultRole));
    (async () => {
      try {
        // Nothing stored: don't ask the network, so a first launch opens straight away.
        if (await api.hasToken()) await reload();
      } catch {
        // Offline, or the sign-in has ended. Either way the sign-in screen is the place
        // to be; a sign-in that is still good is picked up again from there.
        forget();
      } finally {
        // But not for long: a slow server must not keep the splash screen up.
        await Promise.race([config, new Promise((resolve) => setTimeout(resolve, 3000))]);
        setLoading(false);
      }
    })();
    return () => api.onSignedOut(null);
  }, [reload, forget]);

  const finish = useCallback(async (answer: Answer): Promise<Challenge | null> => {
    if ("twoFactor" in answer) return { challenge: answer.challenge, methods: answer.methods };
    // Nothing of an earlier sign-in is carried over: setTokens keeps a refresh token it
    // already holds when the answer has none, which is right for a renewal and wrong here.
    await api.clearTokens();
    await api.setTokens(answer);
    era.current += 1;
    setUser(answer.user);
    return null;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      shell,
      reload,
      signIn: async (email, password) => finish(await api.post<Answer>("/auth/token", { email, password, deviceName: deviceName() }, { auth: false })),
      verifySecondStep: async (challenge, method, code) => {
        await finish(await api.post<Answer>("/auth/two-factor/verify", { challenge, method, code: code.trim() }, { auth: false }));
      },
      sendSecondStepCode: async (challenge) => {
        await api.post("/auth/two-factor/send", { challenge }, { auth: false });
      },
      sendEmailCode: async (email) => {
        await api.post("/auth/email-code", { email }, { auth: false });
      },
      signInWithCode: async (email, code) => finish(await api.post<Answer>("/auth/email-code/verify", { email, code: code.trim(), deviceName: deviceName() }, { auth: false })),
      signInWithProvider: async (provider) => {
        const answer = await authorize<Answer>(provider, deviceName());
        // Closing the window, or saying no at the provider, is not an error: nothing has changed.
        return answer === null ? null : finish(answer);
      },
      register: async (name, email, password) => {
        const answer = await api.post<Answer | { verify: true }>("/auth/register", { name: name.trim(), email, password, deviceName: deviceName() }, { auth: false });
        return "verify" in answer ? "verify" : finish(answer);
      },
      verifyEmail: async (email, code) => finish(await api.post<Answer>("/auth/email/verify", { email, code: code.trim(), deviceName: deviceName() }, { auth: false })),
      resendVerification: async (email) => {
        await api.post("/auth/email/send", { email }, { auth: false });
      },
      forgotPassword: async (email) => {
        await api.post("/auth/password/forgot", { email, method: "code" }, { auth: false });
      },
      resetPassword: async (email, code, newPassword) => {
        await api.post("/auth/password/reset", { email, code: code.trim(), newPassword }, { auth: false });
      },
      signOut: async () => {
        // First, while the sign-in still works: the next person on this phone doesn't get these pushes.
        await forgetPush();
        try {
          await api.delete("/auth/token");
        } catch {
          // Offline or already ended: the device forgets the sign-in either way.
        }
        try {
          await api.clearTokens();
        } finally {
          forget(); // even if the keychain refused, the app is signed out
        }
      },
      can: (permission) => Boolean(user && (user.isAdmin || user.permissions.includes(permission))),
    }),
    [user, loading, shell, reload, finish, forget],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (!value) throw new Error("useAuth() needs <AuthProvider> above it.");
  return value;
}

/** Which sign-in methods to offer. Password always works; the rest are the API's to say. */
export async function signInMethods(): Promise<SignInMethods> {
  const config = await api.get<Partial<SignInMethods>>("/auth/config").catch(() => ({}) as Partial<SignInMethods>);
  return {
    emailCode: config.emailCode ?? false,
    registration: config.registration ?? false,
    requireEmailVerification: config.requireEmailVerification ?? false,
    social: Array.isArray(config.social) ? config.social : [],
    defaultRole: typeof config.defaultRole === "string" ? config.defaultRole : null,
  };
}
