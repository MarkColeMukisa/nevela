import type { NextRequest } from "next/server";
import { API_URL, sessionToken } from "@/lib/laravel";

/**
 * The browser's way to the Laravel API, for the few things a server action can't do:
 *
 * - reading, for the relation picker's search (`/api/categories?q=…`),
 * - showing stored files (`/api/_nevela/files/<key>`), and
 * - uploading one (`PUT /api/_nevela/uploads/<Resource>/<field>`), which needs the
 *   browser's upload progress and is larger than a server action accepts.
 *
 * The token stays in its httpOnly cookie: it is read here, on the server, and sent on
 * as a Bearer token. Laravel still decides what the person may see or store. Everything
 * else that changes data goes through the server actions, so nothing but an upload is
 * let through here as a write.
 */
export const dynamic = "force-dynamic";

/** Larger than any field allows; Laravel enforces the real limit. This only stops a runaway request early. */
const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

/** What is passed back from Laravel's answer. */
const RESPONSE_HEADERS = ["content-type", "content-length", "cache-control", "etag", "last-modified", "location", "x-content-type-options"];

type Context = { params: Promise<{ path: string[] }> };

function target(path: string[], search: string): string | null {
  if (path.some((segment) => segment === "" || segment === "." || segment === "..")) return null;
  return `${API_URL}/${path.map(encodeURIComponent).join("/")}${search}`;
}

async function forward(url: string, init: RequestInit, withToken: boolean): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", headers.get("Accept") ?? "application/json");
  const token = withToken ? await sessionToken() : undefined;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let upstream: Response;
  try {
    upstream = await fetch(url, { ...init, headers, cache: "no-store", redirect: "manual" });
  } catch {
    return Response.json({ error: "Can't reach the API. Is the Laravel app running?" }, { status: 502 });
  }
  const passed = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) passed.set(name, value);
  }
  return new Response(upstream.status === 204 || upstream.status === 304 ? null : upstream.body, { status: upstream.status, headers: passed });
}

export async function GET(request: NextRequest, context: Context) {
  const { path } = await context.params;
  const url = target(path, request.nextUrl.search);
  if (!url) return Response.json({ error: "Not found." }, { status: 404 });

  // Stored files are public and cacheable, so they are asked for without the token.
  const isFile = path[0] === "_nevela" && path[1] === "files";
  const conditional: Record<string, string> = {};
  for (const name of ["if-none-match", "if-modified-since"]) {
    const value = request.headers.get(name);
    if (value) conditional[name] = value;
  }
  return forward(url, { method: "GET", headers: { Accept: request.headers.get("accept") ?? "application/json", ...conditional } }, !isFile);
}

export async function PUT(request: NextRequest, context: Context) {
  const { path } = await context.params;
  const url = target(path, request.nextUrl.search);
  if (!url || path[0] !== "_nevela" || path[1] !== "uploads") {
    return Response.json({ error: "Only uploads are sent this way. Records are saved through the dashboard." }, { status: 405 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "That file is too large to upload." }, { status: 413 });
  }

  // Read whole, then sent with its length: PHP's development server can't take a body
  // that arrives in chunks, which is how a stream would be passed on.
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "That file is too large to upload." }, { status: 413 });
  }
  return forward(url, { method: "PUT", body, headers: { "Content-Type": request.headers.get("content-type") ?? "application/octet-stream" } }, true);
}
