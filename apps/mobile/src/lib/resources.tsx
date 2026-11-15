import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { api } from "./api";
import { useAuth, type User } from "./auth";

/**
 * The app's resources, as Laravel describes them (`GET _nevela/resources`).
 *
 * The dashboard has a generated file per resource. The mobile app asks instead: its
 * screens are drawn from these descriptions each time it starts, so a resource added with
 * `nevela resource` is in the app the next time it opens, with nothing to regenerate and
 * no new build to ship.
 */

export type FieldKind = "string" | "text" | "int" | "float" | "boolean" | "date" | "datetime" | "enum" | "belongsTo" | "file" | "json";

/** One field of a resource. Only what differs from the usual is sent, so most keys are often missing. */
export interface FieldSpec {
  kind: FieldKind;
  /** How a string or a number is meant: "email", "url", "tel", "money", "percent", "rating", … */
  format?: string;
  /** enum: the values, and what each is called where it isn't the value made readable. */
  options?: string[];
  optionLabels?: Record<string, string>;
  /** money: an ISO 4217 code. */
  currency?: string;
  /** belongsTo: the name of the resource it points at, such as "Category". */
  target?: string;
  /** file: what it takes ("image", "pdf", …), and whether it holds several. */
  accept?: string[];
  multiple?: boolean;
  maxLength?: number;
  /** The field it applies for, and the value or values: `{ kind: "digital" }`. */
  when?: Record<string, string | boolean | (string | boolean)[]>;
  default?: string | number | boolean;
  /** A number Laravel gives each new record (INV-0001): never typed. */
  auto?: string;
  /** slug: the field it is made from when left empty. */
  from?: string;
  /** Only ever sent as false: a field is required unless it says otherwise. */
  required?: false;
  unique?: boolean;
  label?: string;
}

export interface Resource {
  /** "Product". What a belongsTo field's `target` names. */
  name: string;
  /** "products". What permissions are named by: products.view. */
  table: string;
  /** "products". Its place in the API: GET /products. */
  slug: string;
  label: string;
  pluralLabel: string;
  icon?: string;
  group?: string;
  titleField?: string;
  /** The resource its lines are, for one with line items: an order's "OrderItem". */
  items?: string;
  fields: Record<string, FieldSpec>;
}

/** A record of any resource: its id, its fields, and the details of its files beside them. */
export type ResourceRecord = { id: string; createdAt?: string; updatedAt?: string } & Record<string, unknown>;

export type Ability = "view" | "create" | "edit" | "delete";

/** "downloadUrl" → "Download url", as Laravel and the dashboard make a name readable. */
export function humanize(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** What a field is called. "categoryId" reads as "Category". */
export function fieldLabel(name: string, field: FieldSpec): string {
  return field.label ?? humanize(field.kind === "belongsTo" ? name.replace(/Id$/, "") : name);
}

/** What an enum's value is called: its label, or the value made readable ("on_hold" → "On hold"). */
export function optionLabel(field: FieldSpec, value: string): string {
  return field.optionLabels?.[value] ?? humanize(value);
}

/** The field shown as a record's title: the one named, else the first string field, else the id. */
export function titleField(resource: Resource): string {
  if (resource.titleField) return resource.titleField;
  return Object.entries(resource.fields).find(([, field]) => field.kind === "string")?.[0] ?? "id";
}

export function titleOf(resource: Resource, record: ResourceRecord): string {
  const value = record[titleField(resource)];
  return value === null || value === undefined || value === "" ? `${resource.label} ${String(record.id).slice(0, 8)}` : String(value);
}

/** Whether a field applies, given the rest of the record: `when: { kind: "digital" }` and kind is "digital". */
export function applies(field: FieldSpec, values: Record<string, unknown>): boolean {
  if (!field.when) return true;
  return Object.entries(field.when).every(([on, wanted]) => {
    const value = values[on];
    return (Array.isArray(wanted) ? wanted : [wanted]).some((one) => (typeof one === "boolean" ? Boolean(value) === one : value !== null && value !== undefined && String(value) === one));
  });
}

/** Whether the user holds a permission on a resource. Laravel decides each request whatever this says. */
export function may(user: User | null, resource: Resource, ability: Ability): boolean {
  return Boolean(user && (user.isAdmin || user.permissions.includes(`${resource.table}.${ability}`)));
}

interface ResourcesValue {
  /** Every resource the user may view, except ones that are another's lines. */
  resources: Resource[];
  /** Every resource there is, by its name: for following a belongsTo. */
  byName: (name: string) => Resource | undefined;
  bySlug: (slug: string) => Resource | undefined;
  loading: boolean;
  error: unknown;
  reload: () => Promise<void>;
}

const ResourcesContext = createContext<ResourcesValue | null>(null);

export function ResourcesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [all, setAll] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const signedIn = user !== null;
  const account = user?.id ?? null;

  const reload = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: Resource[] }>("/_nevela/resources");
      setAll(data);
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  }, []);

  useEffect(() => {
    // What one account was shown is not carried over to the next.
    titles.clear();
    if (!signedIn) {
      setAll([]);
      return;
    }
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [signedIn, account, reload]);

  const value = useMemo<ResourcesValue>(() => {
    // An order's items are edited with the order, not on their own.
    const lines = new Set(all.map((resource) => resource.items).filter(Boolean));
    return {
      resources: all.filter((resource) => !lines.has(resource.name) && may(user, resource, "view")),
      byName: (name) => all.find((resource) => resource.name === name),
      bySlug: (slug) => all.find((resource) => resource.slug === slug),
      loading,
      error,
      reload,
    };
  }, [all, user, loading, error, reload]);

  return <ResourcesContext value={value}>{children}</ResourcesContext>;
}

export function useResources(): ResourcesValue {
  const value = use(ResourcesContext);
  if (!value) throw new Error("useResources() needs <ResourcesProvider> above it.");
  return value;
}

/** What a related record is called, remembered so a list asks for each one once. */
const titles = new Map<string, string>();

/** The titles of the records these ids are, of one resource: `{ id: title }`. Ids that can't be read are left out. */
export async function relatedTitles(resource: Resource, ids: string[]): Promise<Record<string, string>> {
  const wanted = [...new Set(ids.filter(Boolean))];
  await Promise.all(
    wanted
      .filter((id) => !titles.has(`${resource.slug}:${id}`))
      .map(async (id) => {
        try {
          titles.set(`${resource.slug}:${id}`, titleOf(resource, await api.get<ResourceRecord>(`/${resource.slug}/${encodeURIComponent(id)}`)));
        } catch {
          // Deleted, or not theirs to see: the screen shows nothing for it.
        }
      }),
  );
  return Object.fromEntries(wanted.filter((id) => titles.has(`${resource.slug}:${id}`)).map((id) => [id, titles.get(`${resource.slug}:${id}`) as string]));
}

/** Forget a record's title, after it was changed. */
export function forgetTitle(resource: Resource, id: string): void {
  titles.delete(`${resource.slug}:${id}`);
}
