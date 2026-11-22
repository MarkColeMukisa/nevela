// The tabs layout.ts asks for, worked out from the resources a person may see. Nevela's: the
// dashboard's sidebar and the phone app's tab bar both call it, so the two always agree.

import type { LayoutSettings } from "./layout";
import { shopShape, type ShapeResource } from "./shop";

/** What a tab needs of a resource, beyond what the shop rule reads. */
export interface TabResource extends ShapeResource {
  slug: string;
  pluralLabel: string;
}

export interface StaffTab<R extends TabResource> {
  resource: R;
  /** What it is to the app: a shop's orders, what it sells, or a resource chosen by name. */
  role: "orders" | "catalogue" | "chosen";
  /** What the tab is called: "Orders", "Catalogue", or the resource's plural label. */
  title: string;
}

/**
 * The tabs between Home and More, in order. Only resources in `visible` (what this person
 * may see) are ever a tab. Empty for an app with no shop that names none: then each app
 * shows its plain list of records in their place.
 *
 * @param all Every resource, so a shop is found even where its lines aren't visible on their own
 */
export function staffTabs<R extends TabResource>(settings: LayoutSettings, all: R[], visible: R[] = all): StaffTab<R>[] {
  const seen = new Set(visible.map((resource) => resource.name));
  if (Array.isArray(settings.tabs)) {
    return settings.tabs
      .map((name) => visible.find((resource) => resource.name === name))
      .filter((resource): resource is R => resource !== undefined)
      .map((resource) => ({ resource, role: "chosen" as const, title: resource.pluralLabel }));
  }
  const shop = shopShape(all);
  if (!shop) return [];
  const tabs: StaffTab<R>[] = [];
  if (seen.has(shop.orders.name)) tabs.push({ resource: shop.orders, role: "orders", title: shop.orders.pluralLabel });
  if (seen.has(shop.catalogue.name)) tabs.push({ resource: shop.catalogue, role: "catalogue", title: "Catalogue" });
  return tabs;
}
