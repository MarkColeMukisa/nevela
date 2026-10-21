import { diagnose, isNevelaConfig, type ApiProbe } from "@/lib/api-diagnosis";
import { API_URL } from "@/lib/laravel";

let checked: Promise<string[]> | null = null;
const logged = new Set<string>();

/**
 * Whether the dashboard can talk to the Laravel app, asked once per server: the address in
 * NEVELA_API_URL, and the secret the two share. Each problem is logged once, with what to
 * change. The sign-in page shows them in development.
 *
 * A Laravel app that can't be reached is asked again next time, because `nevela dev`
 * starts the two together and Laravel may simply not be up yet.
 */
export function apiProblems(): Promise<string[]> {
  checked ??= probe().then(({ problems, settled }) => {
    if (!settled) checked = null;
    for (const problem of problems) {
      if (logged.has(problem)) continue;
      logged.add(problem);
      console.warn(`[nevela] ${problem}`);
    }
    return problems;
  });
  return checked;
}

async function probe(): Promise<{ problems: string[]; settled: boolean }> {
  const secret = process.env.NEVELA_PROXY_SECRET;
  const ask = async (url: string): Promise<{ status: number; nevela: boolean; proxySecret?: unknown } | "unreachable"> => {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", ...(secret ? { "X-Nevela-Proxy-Secret": secret } : {}) },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      // Anything can answer 200: it counts only if it is Nevela's sign-in settings.
      const body: unknown = response.ok ? await response.json().catch(() => null) : null;
      return isNevelaConfig(body) ? { status: response.status, nevela: true, proxySecret: body.proxySecret } : { status: response.status, nevela: false };
    } catch {
      return "unreachable";
    }
  };

  const config = await ask(`${API_URL}/auth/config`);
  let nevelaUnderApi: ApiProbe["nevelaUnderApi"] = null;
  if (config !== "unreachable" && !config.nevela && !/\/api$/.test(API_URL)) {
    const underApi = await ask(`${API_URL}/api/auth/config`);
    nevelaUnderApi = underApi !== "unreachable" && underApi.nevela;
  }

  return { problems: diagnose({ apiUrl: API_URL, config, nevelaUnderApi }), settled: config !== "unreachable" };
}
