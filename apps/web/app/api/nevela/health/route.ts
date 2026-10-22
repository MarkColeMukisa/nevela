import { timingSafeEqual } from "node:crypto";
import { apiProblems } from "@/lib/api-check";

/**
 * What the dashboard can tell about its own setup, for `nevela deploy:check` on the Laravel
 * app: whether it reaches the API and the secret is the same there, and the address it puts
 * in links. It names addresses and settings, so it answers only a caller with the secret
 * the two apps share.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.NEVELA_PROXY_SECRET ?? "";
  const sent = request.headers.get("x-nevela-proxy-secret") ?? "";
  if (secret === "") return Response.json({ error: "This dashboard has no NEVELA_PROXY_SECRET.", code: "NO_SECRET" }, { status: 403 });
  if (sent === "") return Response.json({ error: "Send the shared secret.", code: "NO_SECRET_SENT" }, { status: 403 });
  if (!same(sent, secret)) return Response.json({ error: "That isn't this dashboard's secret.", code: "SECRET_DIFFERS" }, { status: 403 });

  return Response.json({
    nevela: "dashboard",
    problems: await apiProblems(),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? null,
  });
}

/** Compared in constant time, so the answer gives a guess nothing to go on. */
function same(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
