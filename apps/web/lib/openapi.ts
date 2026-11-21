import { laravel } from "./laravel";

/**
 * The API as Laravel describes it (`/_nevela/openapi.json`): OpenAPI 3.1, written from the
 * resource descriptors. Only the parts the dashboard's API page reads are typed here.
 */
export interface Schema {
  $ref?: string;
  type?: string | string[];
  format?: string;
  enum?: unknown[];
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  oneOf?: Schema[];
  title?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  pattern?: string;
}

export interface Parameter {
  name: string;
  in: "query" | "path";
  required?: boolean;
  description?: string;
  schema: Schema;
}

export interface Operation {
  tags?: string[];
  operationId: string;
  summary?: string;
  description?: string;
  parameters?: Parameter[];
  security?: unknown[];
  requestBody?: { required?: boolean; content: Record<string, { schema: Schema }> };
  responses: Record<string, { $ref?: string; description?: string; content?: Record<string, { schema: Schema }> }>;
  "x-nevela-permission"?: string;
  "x-nevela-confirm"?: string;
}

export const METHODS = ["get", "post", "put", "patch", "delete"] as const;
export type Method = (typeof METHODS)[number];

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers: { url: string }[];
  tags?: { name: string; description?: string }[];
  paths: Record<string, Partial<Record<Method, Operation>> & { parameters?: Parameter[] }>;
  components: { schemas: Record<string, Schema>; responses: Record<string, { description: string; content?: Record<string, { schema: Schema }> }> };
}

export type OpenApiResult = { status: "ok"; document: OpenApiDocument } | { status: "missing" } | { status: "error"; message: string };

/** The document, or why there is none: "missing" is a Laravel app on a Nevela from before it was served. */
export async function loadOpenApi(): Promise<OpenApiResult> {
  const response = await laravel("_nevela/openapi.json");
  if (response.status === 404) return { status: "missing" };
  if (!response.ok) {
    const error = (response.body as { error?: string } | null)?.error;
    return { status: "error", message: error ?? `Laravel answered ${response.status}.` };
  }
  return { status: "ok", document: response.body as OpenApiDocument };
}

/** What a "#/components/…" reference points at, or the thing itself when it isn't one. */
export function resolve<T>(document: OpenApiDocument, value: T & { $ref?: string }): T {
  if (!value.$ref) return value;
  let node: unknown = document;
  for (const part of value.$ref.replace(/^#\//, "").split("/")) node = (node as Record<string, unknown> | undefined)?.[part];
  return (node ?? value) as T;
}

/** The name a reference gives: "#/components/schemas/Product" is "Product". */
export function refName(value: { $ref?: string }): string | null {
  return value.$ref ? value.$ref.split("/").pop() ?? null : null;
}

/** A schema in a few words: "string (email)", "one of pending, paid", "list of Product", "or empty". */
export function describeType(document: OpenApiDocument, schema: Schema): string {
  const named = refName(schema);
  if (named) return named;
  if (schema.oneOf) {
    const kinds = schema.oneOf.filter((one) => one.type !== "null").map((one) => describeType(document, one));
    return kinds.join(" or ") + (schema.oneOf.length > kinds.length ? ", or empty" : "");
  }
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const empty = types.includes("null");
  const real = types.filter((type) => type !== "null");
  let words: string;
  if (schema.enum) words = `one of ${schema.enum.filter((value) => value !== null).map((value) => String(value)).join(", ")}`;
  else if (real.includes("array") && schema.items) words = `list of ${describeType(document, schema.items)}`;
  else words = real.join(" or ") + (schema.format ? ` (${schema.format})` : "");
  return words + (empty ? ", or empty" : "");
}

/** The lines a schema's fields make in a table: each property, whether it must be sent, and what it is. */
export function fieldsOf(document: OpenApiDocument, schema: Schema): { name: string; required: boolean; type: string; about: string }[] {
  const resolved = resolve(document, schema);
  const required = new Set(resolved.required ?? []);
  return Object.entries(resolved.properties ?? {}).map(([name, property]) => ({
    name,
    required: required.has(name),
    type: describeType(document, property),
    about: [
      property.description,
      property.maxLength !== undefined ? `At most ${property.maxLength.toLocaleString()} characters.` : null,
      property.minimum !== undefined && property.maximum !== undefined ? `From ${property.minimum} to ${property.maximum}.` : null,
      property.default !== undefined ? `Left out, ${JSON.stringify(property.default)}.` : null,
    ]
      .filter(Boolean)
      .join(" "),
  }));
}
