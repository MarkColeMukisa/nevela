import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { api } from "./api";

/** The providers the API can offer, as the buttons name them. */
export const PROVIDERS: Record<string, { label: string; icon: "logo-google" | "logo-github" }> = {
  google: { label: "Google", icon: "logo-google" },
  github: { label: "GitHub", icon: "logo-github" },
};

// Lets the browser window close itself and hand control back when it returns to the app on the web preview.
WebBrowser.maybeCompleteAuthSession();

const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

/**
 * Sign in with a provider such as Google, in the phone's browser, and come back with
 * what the API answered: a sign-in, or a second step still owed. Null when the person
 * closed the window or said no at the provider.
 *
 * The phone never sees the provider's keys. It asks the API where to send the browser, the
 * provider returns to the API, and the API hands the browser back to the app by its own
 * address (`shop://oauth`), which carries only a one-time code and a state. The app proves
 * it is the one that began with a secret it kept the whole time and sent only as a hash, so
 * a code taken off the phone's screen or by another app is no use to anyone else.
 */
export async function authorize<T>(provider: string, deviceName: string): Promise<T | null> {
  const label = PROVIDERS[provider]?.label ?? provider;

  const verifier = hex(Crypto.getRandomBytes(32));
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 });
  const challenge = digest.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  // Where the API sends the browser back to: this app's own address. Expo Go has one of its own while developing.
  const back = Linking.createURL("oauth");
  const started = await api.post<{ url: string; state: string }>(`/auth/oauth/${provider}/start`, { app: { redirect: back, challenge }, deviceName }, { auth: false });

  const result = await WebBrowser.openAuthSessionAsync(started.url, back);
  if (result.type !== "success") return null;

  const returned = Linking.parse(result.url).queryParams ?? {};
  const one = (value: unknown) => (typeof value === "string" ? value : undefined);
  if (one(returned.error)) {
    if (one(returned.error) === "access_denied") return null;
    throw new Error(`${label} sign-in didn't finish. Try again.`);
  }
  const code = one(returned.code);
  if (!code || one(returned.state) !== started.state) throw new Error(`${label} sign-in didn't finish. Try again.`);

  return api.post<T>(`/auth/oauth/${provider}/callback`, { state: started.state, code, appVerifier: verifier, deviceName }, { auth: false });
}
