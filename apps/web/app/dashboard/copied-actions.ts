"use server";

import { allResources, dashboardStore } from "@/lib/dashboard";

/**
 * A field of a record, for a form that copies it: the price of the product just picked
 * for an order item. Read as the person reading it, so Laravel decides whether they may.
 * Null when there is nothing to copy, or they may not see it.
 */
export async function copiedValue(resourceName: string, id: string, field: string): Promise<string | number | null> {
  const resource = allResources().find((candidate) => candidate.name === resourceName);
  if (!resource || !(field in resource.fields) || id === "") return null;
  const result = await dashboardStore(resource.name).get(id);
  if (!result.ok) return null;
  const value = result.data[field];
  return typeof value === "number" || typeof value === "string" ? value : null;
}
