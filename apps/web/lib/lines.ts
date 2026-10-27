// Which resources have lines (an order's items), and which are lines.
//
// The descriptor's "items", written by `php nevela generate` into resources/index.ts as
// part of `extras`. Read here rather than in lib/extras.ts: a new file is always added by
// an upgrade, so an app that kept its own extras.ts still builds.

import type { Resource } from "@flaredev/core";
import * as registry from "@/resources";
import { visibleResources } from "./dashboard";

/** The lines a record has, edited in its form and saved with it: an order's items. */
export interface ResourceItems {
  /** The resource they are: "OrderItem". */
  resource: string;
  /** Their field that points at the record they are lines of: "orderId". */
  field: string;
}

const extras = ((registry as { extras?: unknown }).extras ?? {}) as Record<string, { items?: ResourceItems }>;

/** A resource's lines, if it has some. */
export function itemsOf(resourceName: string): ResourceItems | undefined {
  return extras[resourceName]?.items;
}

/** Whether a resource is another one's lines, reached through it rather than on its own. */
export function isLines(resourceName: string): boolean {
  return Object.values(extras).some((entry) => entry.items?.resource === resourceName);
}

/**
 * The resources the current user may read that have a place of their own, for the
 * sidebar and the dashboard's home: an order's items are reached through their order.
 */
export async function navigableResources(): Promise<Resource[]> {
  return (await visibleResources()).filter((resource) => !isLines(resource.name));
}
