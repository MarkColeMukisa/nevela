import Constants from "expo-constants";
import { Platform } from "react-native";

import * as storage from "./storage";

/**
 * The only `fetch` to Laravel. Every screen goes through `api`.
 *
 * The dashboard reaches Laravel through its own server and keeps the token in a cookie.
 * A phone has no such server: it calls Laravel itself, with the token as a Bearer header,
 * and keeps the token in the device's keychain (lib/storage.ts).
 */

/**
 * Where the API is.
 *
 * 1. EXPO_PUBLIC_API_URL when set, such as https://api.example.com/api: a deployed app.
 * 2. While developing, the address this phone already used to reach the Expo dev server.
 *    `localhost` on a phone is the phone, so the computer's address on the network is the
 *    one that works, and it changes with the network: better found than written down.
 * 3. The emulator's name for the computer (Android), or localhost (iOS simulator, web).
 *
 * EXPO_PUBLIC_API_PORT is the port `nevela dev` serves the API on. It writes that into
 * .env.local each time it starts, so the two agree when 8000 was taken.
 */
function resolveApiUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const port = process.env.EXPO_PUBLIC_API_PORT || "8000";
  const hostUri = Constants.expoConfig?.hostUri ?? "";
  const host = hostUri.split(":")[0];
  if (Platform.OS !== "web" && host && host !== "localhost" && host !== "127.0.0.1") {
    return `http://${host}:${port}/api`;
  }
  return Platform.OS === "android" ? `http://10.0.2.2:${port}/api` : `http://127.0.0.1:${port}/api`;
}

export const API_URL = resolveApiUrl();

/** A request that takes longer than this is given up on, so a screen is never left waiting on a server that isn't there. */
const TIMEOUT_MS = 30_000;
/** A token this close to its end is swapped before it is used, not after it fails. */
const RENEW_BEFORE_MS = 30_000;

const KEYS = { access: "nevela.token", expires: "nevela.expiresAt", refresh: "nevela.refreshToken" } as const;

export interface TokenPair {
  token: string;
  expiresAt?: string | null;
  refreshToken?: string | null;
}

/** What Laravel said when it refused: its message, its `code`, and which fields were wrong. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
    readonly issues: { path: string; message: string }[] = [],
    readonly body: unknown = null,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** The message for one field of a form, when the refusal was about it. */
  issue(path: string): string | undefined {
    return this.issues.find((issue) => issue.path === path)?.message;
  }
}

/** The request never got an answer: no network, the wrong address, or the API isn't running. */
export class UnreachableError extends Error {
  constructor(readonly url: string) {
    super(`Couldn't reach the server at ${url}.`);
    this.name = "UnreachableError";
  }
}

let cached: { access: string | null; expires: number | null; refresh: string | null } | null = null;
let refreshing: Promise<boolean> | null = null;
let onSignedOut: (() => void) | null = null;

async function tokens() {
  if (cached === null) {
    const [access, expires, refresh] = await Promise.all([storage.getItem(KEYS.access), storage.getItem(KEYS.expires), storage.getItem(KEYS.refresh)]);
    const at = expires ? Date.parse(expires) : NaN;
    cached = { access, expires: Number.isNaN(at) ? null : at, refresh };
  }
  return cached;
}

async function send(path: string, init: RequestInit): Promise<Response> {
  const url = `${API_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new UnreachableError(API_URL);
  } finally {
    clearTimeout(timer);
  }
}

async function parse(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function refusal(response: Response, body: unknown): ApiError {
  const data = (typeof body === "object" && body !== null ? body : {}) as { error?: unknown; message?: unknown; code?: unknown; issues?: unknown };
  const message = typeof data.error === "string" ? data.error : typeof data.message === "string" ? data.message : `The server answered ${response.status}.`;
  const issues = Array.isArray(data.issues) ? (data.issues as { path: string; message: string }[]) : [];
  return new ApiError(message, response.status, typeof data.code === "string" ? data.code : null, issues, body);
}

/**
 * Swap the refresh token for a new pair. One swap at a time: a refresh token works once,
 * so two screens asking together must share the answer.
 */
function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const held = await tokens();
      if (!held.refresh) return false;
      const response = await send("/auth/refresh", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: held.refresh }),
      });
      if (!response.ok) {
        // The sign-in has ended (idle, expired, signed out elsewhere). Anything else,
        // such as a 500, is the server's trouble and says nothing about the sign-in.
        if (response.status === 401) await api.clearTokens();
        return false;
      }
      await api.setTokens((await parse(response)) as TokenPair);
      return true;
    } catch {
      return false; // offline: keep what we have and let the caller's request say so
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

interface Options {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Sent as JSON. */
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  /** False for the endpoints that sign a person in: there is no token to send yet. */
  auth?: boolean;
}

async function request<T>(path: string, { method = "GET", body, query, auth = true }: Options = {}): Promise<T> {
  const search = Object.entries(query ?? {})
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  const target = search ? `${path}?${search}` : path;

  const attempt = async (): Promise<Response> => {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (auth) {
      const held = await tokens();
      if (held.access) headers.Authorization = `Bearer ${held.access}`;
    }
    return send(target, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  };

  if (auth) {
    const held = await tokens();
    if (held.access && held.refresh && held.expires !== null && held.expires - Date.now() < RENEW_BEFORE_MS) await refresh();
  }

  let response = await attempt();
  if (response.status === 401 && auth && (await tokens()).refresh && (await refresh())) {
    response = await attempt();
  }

  const data = await parse(response);
  if (!response.ok) {
    if (response.status === 401 && auth) {
      await api.clearTokens();
      onSignedOut?.();
    }
    throw refusal(response, data);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Options["query"]) => request<T>(path, { query }),
  post: <T>(path: string, body?: unknown, options: Pick<Options, "auth"> = {}) => request<T>(path, { method: "POST", body: body ?? {}, ...options }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body }),
  delete: <T = null>(path: string) => request<T>(path, { method: "DELETE" }),

  async hasToken(): Promise<boolean> {
    const held = await tokens();
    return Boolean(held.access || held.refresh);
  },

  /** Keep a new pair. A swap that answers `refreshToken: null` means "keep the one you have". */
  async setTokens(pair: TokenPair): Promise<void> {
    const held = await tokens();
    const at = pair.expiresAt ? Date.parse(pair.expiresAt) : NaN;
    cached = { access: pair.token, expires: Number.isNaN(at) ? null : at, refresh: pair.refreshToken ?? held.refresh };
    await Promise.all([
      storage.setItem(KEYS.access, pair.token),
      pair.expiresAt ? storage.setItem(KEYS.expires, pair.expiresAt) : storage.removeItem(KEYS.expires),
      cached.refresh ? storage.setItem(KEYS.refresh, cached.refresh) : storage.removeItem(KEYS.refresh),
    ]);
  },

  async clearTokens(): Promise<void> {
    cached = { access: null, expires: null, refresh: null };
    await Promise.all([storage.removeItem(KEYS.access), storage.removeItem(KEYS.expires), storage.removeItem(KEYS.refresh)]);
  },

  /** Called when a request finds the sign-in has ended, so the app can show the sign-in screen. */
  onSignedOut(listener: (() => void) | null): void {
    onSignedOut = listener;
  },
};

/** What to show a person when a request failed. */
export function messageOf(error: unknown): string {
  if (error instanceof UnreachableError) return `Couldn't reach the server at ${error.url}. Check that the API is running and this device is on the same network.`;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Try again.";
}
