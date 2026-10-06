import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { can, type Policy, type PolicyAction, type Resource } from "@flaredev/core";
import { laravelStore, type ResourceStore } from "@/lib/resource";
import { policies } from "@/policies";
import { resources } from "@/resources";
import { revalidateResource } from "./cache";
import { laravel } from "./laravel";
import { getSession } from "./session";

/**
 * The dashboard's view of a resource, with Laravel behind it.
 *
 * The same exports Flare's dashboard components expect. Records come from Laravel's
 * REST API (lib/resource/store.ts) and the session from its token endpoints
 * (lib/session.ts); nothing here touches a database.
 */

/**
 * A further display-only policy, by role name (policies/index.ts). Optional, and on top of
 * the person's permissions: an entry here can hide more, never show more.
 */
export function policyFor(resourceName: string): Policy | undefined {
  return (policies as Record<string, Policy | undefined>)[resourceName];
}

/** What each of the dashboard's actions is called as a permission. */
const VERB: Record<PolicyAction, string> = { list: "view", read: "view", create: "create", update: "edit", delete: "delete" };

/** The permission an action on a resource asks for: "products.edit". */
export function permissionFor(resource: Resource, action: PolicyAction): string {
  return `${resource.table}.${VERB[action]}`;
}

/**
 * The signed-in person and what they may do.
 *
 * `may("products.view")` answers from the permissions Laravel worked out from their roles.
 * It is for showing and hiding: Laravel decides every request again for itself, so nothing
 * here is what keeps anyone out.
 */
export async function dashboardSession() {
  const session = await getSession();
  if (!session) return { session: null, role: null, roles: [] as string[], allowed: false, isAdmin: false, may: () => false } as const;
  const { user } = session;
  // An API from before roles sends no list. Everyone could do everything then, and still can.
  const everything = user.permissions === undefined || user.isAdmin === true;
  const held = new Set(user.permissions ?? []);
  const may = (permission: string) => everything || held.has(permission);
  // Anyone signed in has a dashboard, if only for their own account.
  return { session, role: user.role ?? null, roles: user.roles ?? (user.role ? [user.role] : []), allowed: true, isAdmin: everything, may } as const;
}

/** Whether the current person may do `action` on a resource: their permissions, and the display policy if there is one. */
export async function mayDo(resource: Resource, action: PolicyAction): Promise<boolean> {
  const { session, roles, may } = await dashboardSession();
  if (!session || !may(permissionFor(resource, action))) return false;
  const policy = policyFor(resource.name);
  return !policy || roles.some((role) => can(policy, role, action)) || (roles.length === 0 && can(policy, null, action));
}

/** For a page that needs one permission: sends anyone without it back to the dashboard. */
export async function requirePermission(permission: string, returnTo = "/dashboard") {
  const { session, may } = await dashboardSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  if (!may(permission)) redirect("/dashboard?error=forbidden");
  return { session, may };
}

/** For admin pages: redirects signed-out visitors to sign-in and users without access to the home page. */
export async function requireDashboard(returnTo = "/dashboard") {
  const { session, role, allowed } = await dashboardSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  if (!allowed) redirect("/?error=forbidden");
  return { session, role };
}

/**
 * For resource pages: also requires the policy to allow `action` on this resource.
 * Sends the user somewhere they can actually go — the list when they may read it,
 * the dashboard when they may not.
 */
export async function requireAccess(resource: Resource, action: PolicyAction) {
  const { session, role } = await requireDashboard(resourcePath(resource));
  if (!(await mayDo(resource, action))) {
    redirect(action !== "read" && (await mayDo(resource, "read")) ? resourcePath(resource) : "/dashboard?error=forbidden");
  }
  return { session, role };
}

/** What the current user may do with a resource, for hiding actions they can't use. */
export async function adminPermissions(resourceName: string): Promise<Record<Exclude<PolicyAction, "list">, boolean>> {
  const resource = allResources().find((item) => item.name === resourceName);
  if (!resource) return { read: false, create: false, update: false, delete: false };
  const [read, create, update, remove] = await Promise.all((["read", "create", "update", "delete"] as const).map((action) => mayDo(resource, action)));
  return { read: read!, create: create!, update: update!, delete: remove! };
}

const stores = new Map<string, ResourceStore>();

/** CRUD store for a resource by name (404 for unknown names). */
export function dashboardStore(name: string): ResourceStore {
  const resource = allResources().find((item) => item.name === name);
  if (!resource) notFound();
  let store = stores.get(name);
  if (!store) {
    store = laravelStore({ resource, onChange: revalidateResource });
    stores.set(name, store);
  }
  return store;
}

export interface ResourceStats {
  total: number;
  /** Created in the last `days` days, and in the `days` before that. */
  current: number;
  previous: number;
  /** Rows per value of the grouped field, when one was asked for. */
  values: Record<string, number>;
}

const NO_STATS: ResourceStats = { total: 0, current: 0, previous: 0, values: {} };

/**
 * Every number the stats above a resource's table need: `GET /{slug}/_stats`.
 * Counted by Laravel through the same policy as the list, and asked for once per render.
 */
export const resourceStats = cache(async (name: string, field?: string, days = 7): Promise<ResourceStats> => {
  const resource = allResources().find((item) => item.name === name);
  if (!resource) return NO_STATS;
  const def = field ? resource.fields[field] : undefined;
  // Laravel groups by enum and boolean fields only.
  const grouped = def && (def.kind === "enum" || def.kind === "boolean") ? field : undefined;
  const query = new URLSearchParams({ days: String(days), ...(grouped ? { field: grouped } : {}) });
  const response = await laravel(`${resource.slug}/_stats?${query}`);
  return response.ok ? { ...NO_STATS, ...(response.body as ResourceStats) } : NO_STATS;
});

/** How many records a resource has. One field of {@link resourceStats}. */
export async function recordCount(name: string): Promise<number> {
  return (await resourceStats(name)).total;
}

/** Percentage change between two periods, or undefined when there's nothing to compare. */
export function trend(current: number, previous: number): number | undefined {
  if (previous === 0) return current === 0 ? undefined : 100;
  return ((current - previous) / previous) * 100;
}

/** Every resource descriptor (unfiltered): navigation uses `visibleResources()` instead. */
export function allResources(): Resource[] {
  return [...resources] as unknown as Resource[];
}

/** Resources the current user may read, for the sidebar and dashboard. */
export async function visibleResources(): Promise<Resource[]> {
  const visible = await Promise.all(allResources().map((resource) => mayDo(resource, "read")));
  return allResources().filter((_, index) => visible[index]);
}

export function resourcePath(resource: Resource, ...parts: string[]) {
  return ["/dashboard", resource.slug, ...parts].join("/");
}
