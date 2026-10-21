/**
 * What is wrong between the dashboard and the Laravel app, in words, from what asking
 * `{NEVELA_API_URL}/auth/config` found. It has no imports, so it is tested on its own
 * (scripts/web-api-diagnosis.test.ts); lib/api-check.ts does the asking.
 */

export interface ApiProbe {
  /** NEVELA_API_URL, without a trailing slash. */
  apiUrl: string;
  /** What `{apiUrl}/auth/config` answered, and whether that was Nevela's sign-in settings (see isNevelaConfig). */
  config: { status: number; nevela: boolean; proxySecret?: unknown } | "unreachable";
  /** When there was no Nevela there and the address doesn't end in /api: whether `{apiUrl}/api` has one. */
  nevelaUnderApi: boolean | null;
}

/**
 * Whether an answer is Nevela's sign-in settings and not just any page that says 200: a
 * host that answers every path, or the dashboard itself, would otherwise pass for one.
 */
export function isNevelaConfig(body: unknown): body is { proxySecret?: unknown } {
  if (!body || typeof body !== "object") return false;
  const config = body as Record<string, unknown>;
  return typeof config.passkeys === "boolean" && !!config.twoFactor && typeof config.twoFactor === "object" && Array.isArray(config.social);
}

/** The problems, each a sentence that says what to change. None when all is well. */
export function diagnose({ apiUrl, config, nevelaUnderApi }: ApiProbe): string[] {
  if (config === "unreachable") {
    return [`Can't reach the Laravel app at ${apiUrl}. Is it running? Start both apps with: nevela dev`];
  }
  if (!config.nevela) {
    if (nevelaUnderApi) {
      return [`NEVELA_API_URL is ${apiUrl}. Nevela's routes are under /api: set it to ${apiUrl}/api.`];
    }
    if (config.status >= 400 && config.status !== 404) {
      return [`The Laravel app at ${apiUrl} answered ${config.status} to auth/config. Its log says why: storage/logs/laravel.log.`];
    }
    return [
      `NEVELA_API_URL is ${apiUrl}, and nothing there answers as Nevela (auth/config ${config.status === 404 ? "is not found" : "isn't Nevela's"}). It is the Laravel app's address with its prefix, such as http://127.0.0.1:8000/api. Check the address, and nevela.prefix in the Laravel app if you changed it.`,
    ];
  }

  switch (config.proxySecret) {
    case "different":
      return [
        "NEVELA_PROXY_SECRET here isn't the one in the Laravel app's .env. Set the same value in both. Until then Laravel doesn't believe what the dashboard says about visitors: every device is listed with this server's address, and public forms count all visitors as one.",
      ];
    case "missingInApi":
      return ["NEVELA_PROXY_SECRET is set here and not in the Laravel app. Set the same value in its .env."];
    case "missingInDashboard":
      return ["The Laravel app has a NEVELA_PROXY_SECRET and this dashboard doesn't. Set the same value in the dashboard's environment (.env.local)."];
    default:
      return [];
  }
}
