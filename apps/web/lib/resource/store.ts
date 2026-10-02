import type { Resource } from "@flaredev/core";
import { laravel } from "@/lib/laravel";
import type { QueryIssue } from "./query";

export type ResourceAction = "list" | "read" | "create" | "update" | "delete";

export interface FieldIssue {
  /** Dotted field path; "" for the whole body (e.g. unknown keys). */
  path: string;
  message: string;
}

export type Failure = {
  ok: false;
  status: number;
  error: string;
  /** Validation issues per field. */
  issues?: FieldIssue[];
  /** Invalid query parameters. */
  queryIssues?: QueryIssue[];
  /** Field that caused a conflict (e.g. a unique violation). */
  field?: string;
};

export type Result<T> = { ok: true; data: T } | Failure;

export interface ListResult<T = Record<string, unknown>> {
  data: T[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
    /** Laravel counts every match, so this is always true and the list pages by number. */
    exactTotal: boolean;
    nextCursor?: string;
    prevCursor?: string;
  };
}

export interface ChangeEvent {
  /** Resource name, e.g. "Deal". */
  resource: string;
  action: "create" | "update" | "delete";
  id: string;
}

export interface ResourceStoreOptions {
  resource: Resource;
  /** Called after a write succeeds, for cache invalidation. */
  onChange?: (event: ChangeEvent) => void | Promise<void>;
}

type Row = Record<string, unknown>;

/**
 * CRUD for one resource, answered by Laravel.
 *
 * The same methods and the same results as Flare's own store, so the dashboard above it
 * doesn't change. The difference is where the rules live: this validates nothing and
 * decides nothing. Laravel's form request, policy and model do, and their answers
 * (422 with issues per field, 403, 404, 409) are passed through as they are.
 */
export function laravelStore(options: ResourceStoreOptions) {
  const { resource } = options;
  const base = resource.slug;

  function failure(response: { status: number; body: unknown }): Failure {
    const body = (response.body ?? {}) as { error?: string; issues?: unknown[]; field?: string };
    const result: Failure = { ok: false, status: response.status, error: body.error ?? "Request failed." };
    if (response.status === 400 && body.issues) result.queryIssues = body.issues as QueryIssue[];
    else if (body.issues) result.issues = body.issues as FieldIssue[];
    if (body.field) result.field = body.field;
    return result;
  }

  async function announce(action: ChangeEvent["action"], id: string): Promise<void> {
    try {
      await options.onChange?.({ resource: resource.name, action, id });
    } catch (error) {
      console.error(`[nevela] ${resource.name} ${action} cache invalidation failed:`, error);
    }
  }

  async function write(action: ChangeEvent["action"], method: "POST" | "PATCH" | "PUT", path: string, input: unknown): Promise<Result<Row>> {
    const response = await laravel(path, { method, body: input ?? {} });
    if (!response.ok) return failure(response);
    const record = response.body as Row;
    await announce(action, String(record.id));
    return { ok: true, data: record };
  }

  return {
    resource,

    /** `params`: page, perPage, sort, q, filter[field]. Laravel checks them and answers 400 for a bad one. */
    async list(params: URLSearchParams): Promise<Result<ListResult>> {
      const query = new URLSearchParams();
      for (const [key, value] of params) {
        if (key === "page" || key === "perPage" || key === "sort" || key === "q" || key.startsWith("filter[")) query.append(key, value);
      }
      const response = await laravel(`${base}?${query}`);
      if (!response.ok) return failure(response);
      const { data, meta } = response.body as { data: Row[]; meta: Omit<ListResult["meta"], "exactTotal"> };
      return { ok: true, data: { data, meta: { ...meta, exactTotal: true } } };
    },

    async get(id: string): Promise<Result<Row>> {
      const response = await laravel(`${base}/${encodeURIComponent(id)}`);
      return response.ok ? { ok: true, data: response.body as Row } : failure(response);
    },

    /** Title-field values for a set of ids (for showing relations). Missing ids are omitted. */
    async titles(ids: string[]): Promise<Record<string, string>> {
      const unique = [...new Set(ids.filter(Boolean))];
      const found = await Promise.all(unique.map((id) => this.get(id)));
      const titles: Record<string, string> = {};
      for (const [index, result] of found.entries()) {
        if (!result.ok) continue;
        const title = result.data[resource.titleField];
        titles[unique[index]!] = title == null ? unique[index]! : String(title);
      }
      return titles;
    },

    create(input: unknown): Promise<Result<Row>> {
      return write("create", "POST", base, input);
    },

    /** Partial update (PATCH): only the fields sent are validated and changed. */
    update(id: string, input: unknown): Promise<Result<Row>> {
      return write("update", "PATCH", `${base}/${encodeURIComponent(id)}`, input);
    },

    /** Full replacement (PUT): optional fields left out are cleared. */
    replace(id: string, input: unknown): Promise<Result<Row>> {
      return write("update", "PUT", `${base}/${encodeURIComponent(id)}`, input);
    },

    async delete(id: string): Promise<Result<{ id: string }>> {
      const response = await laravel(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) return failure(response);
      await announce("delete", id);
      return { ok: true, data: { id } };
    },
  };
}

export type ResourceStore = ReturnType<typeof laravelStore>;
