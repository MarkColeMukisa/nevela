// The tabs the sidebar puts first, under Home: the same as the phone app's tab bar, from
// packages/shared/layout.ts. A shop's orders and what it sells, unless layout.ts names others.
// Imported by relative path, not "@shared/…": an app that made tsconfig.json its own still builds.

import type { Resource } from "@flaredev/core";
import { layout } from "../../../packages/shared/layout";
import type { ShapeField } from "../../../packages/shared/shop";
import { staffTabs } from "../../../packages/shared/tabs";
import { allResources, visibleResources } from "./dashboard";
import { itemsOf } from "./lines";

export interface SidebarTab {
  name: string;
  slug: string;
  /** "Orders", "Catalogue", or the resource's plural label. */
  title: string;
  role: "orders" | "catalogue" | "chosen";
}

/** What the shared rule reads of a resource: the dashboard keeps its lines in the registry's extras. */
function shape(resource: Resource) {
  return {
    name: resource.name,
    slug: resource.slug,
    pluralLabel: resource.pluralLabel,
    items: itemsOf(resource.name)?.resource ?? null,
    fields: resource.fields as unknown as Record<string, ShapeField>,
  };
}

/** The tabs this person's sidebar starts with: only resources they may see are ever one. */
export async function sidebarTabs(): Promise<SidebarTab[]> {
  const tabs = staffTabs(layout, allResources().map(shape), (await visibleResources()).map(shape));
  return tabs.map((tab) => ({ name: tab.resource.name, slug: tab.resource.slug, title: tab.title, role: tab.role }));
}
