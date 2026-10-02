import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { allowedActions, can, type Policy, type PolicyAction, type Resource } from "@flaredev/core";
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

export const ADMIN_ROLES = ["admin", "staff"];

/**
 * A display-only policy for hiding buttons a role can't use. Optional: Laravel's
 * policies (app/Policies) decide what is actually allowed, and a resource without an
 * entry here shows every action and lets Laravel answer 403.
 */
export function policyFor(resourceName: string): Policy | undefined {
  return (policies as Record<string, Policy | undefined>)[resourceName];
}

export async function dashboardSession() {
  const session = await getSession();
  if (!session) return { session: null, role: null, allowed: false } as const;
  const role = session.user.role ?? null;
  const readable = allResources().some((resource) => can(policyFor(resource.name), role, "read"));
  return { session, role, allowed: (role !== null && ADMIN_ROLES.includes(role)) || readable } as const;
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
  const policy = policyFor(resource.name);
  if (!can(policy, role, action)) {
    redirect(action !== "read" && can(policy, role, "read") ? resourcePath(resource) : "/dashboard?error=forbidden");
  }
  return { session, role };
}

/** What the current user may do with a resource, for hiding actions they can't use. */
export async function adminPermissions(resourceName: string) {
  const { role } = await dashboardSession();
  return allowedActions(policyFor(resourceName), role);
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
  const { role } = await dashboardSession();
  return allResources().filter((resource) => can(policyFor(resource.name), role, "read"));
}

export function resourcePath(resource: Resource, ...parts: string[]) {
  return ["/dashboard", resource.slug, ...parts].join("/");
}
