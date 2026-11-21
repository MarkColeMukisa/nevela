import { NextResponse } from "next/server";
import { dashboardSession } from "@/lib/dashboard";
import { loadOpenApi } from "@/lib/openapi";

/**
 * The API page's download: Laravel's OpenAPI document, fetched with the signed-in
 * administrator's token, for a tool that makes a client or a docs site from one.
 */
export async function GET() {
  const { session, isAdmin } = await dashboardSession();
  if (!session || !isAdmin) return NextResponse.json({ error: "You don't have access to this." }, { status: 403 });
  const result = await loadOpenApi();
  if (result.status !== "ok") return NextResponse.json({ error: result.status === "error" ? result.message : "The Laravel app doesn't describe its API yet." }, { status: 502 });
  return new NextResponse(JSON.stringify(result.document, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="openapi.json"', "Cache-Control": "no-store" },
  });
}
