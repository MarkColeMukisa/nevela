import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { brand } from "../packages/shared/brand.ts";
import { layout } from "../packages/shared/layout.ts";
import { shopShape, shopShapes } from "../packages/shared/shop.ts";
import { staffTabs } from "../packages/shared/tabs.ts";
import { theme, themes } from "../packages/shared/themes.ts";

/** The repository's own example resources, as the descriptors have them. */
function repositoryResources(): any[] {
  const dir = path.resolve(import.meta.dirname, "../apps/api/nevela/resources");
  return fs.readdirSync(dir).filter((file) => file.endsWith(".json")).map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
}

test("the shop is found in the resources: an order whose lines point at what is sold, by a quantity", () => {
  const shape = shopShape(repositoryResources());
  assert.ok(shape);
  assert.equal(shape.orders.name, "Order");
  assert.equal(shape.lines.name, "OrderItem");
  assert.equal(shape.catalogue.name, "Product");
  assert.deepEqual([shape.link, shape.product, shape.quantity], ["orderId", "productId", "quantity"]);
});

test("no shop without lines, without a quantity, or without something else they point at", () => {
  const order = { name: "Order", items: "Line", fields: {} };
  const product = { name: "Product", fields: {} };
  const line = (fields: Record<string, { kind: string; target?: string }>) => ({ name: "Line", fields });
  assert.equal(shopShape([{ ...order, items: null }, product]), null);
  assert.equal(shopShape([order, product, line({ orderId: { kind: "belongsTo", target: "Order" }, productId: { kind: "belongsTo", target: "Product" } })]), null);
  assert.equal(shopShape([order, product, line({ orderId: { kind: "belongsTo", target: "Order" }, qty: { kind: "int" } })]), null);
  // A line pointing at something that isn't a resource here sells nothing.
  assert.equal(shopShape([order, line({ orderId: { kind: "belongsTo", target: "Order" }, productId: { kind: "belongsTo", target: "Product" }, qty: { kind: "float" } })]), null);
  assert.equal(shopShapes([order, product, line({ orderId: { kind: "belongsTo", target: "Order" }, productId: { kind: "belongsTo", target: "Product" }, qty: { kind: "float" } })]).length, 1);
});

test("staff tabs: the shop's orders and what it sells, only what the person may see, or the ones named", () => {
  const all = repositoryResources();
  const byName = (name: string) => all.find((resource) => resource.name === name);

  assert.deepEqual(staffTabs(layout, all).map((tab) => [tab.resource.name, tab.role, tab.title]), [
    ["Order", "orders", "Orders"],
    ["Product", "catalogue", "Catalogue"],
  ]);
  // A role that sees orders and not the products has the one tab. The shop is still found
  // where the lines aren't visible on their own.
  assert.deepEqual(staffTabs(layout, all, [byName("Order")]).map((tab) => tab.resource.name), ["Order"]);
  // Named in layout.ts, in that order; a name that isn't there, or isn't visible, is left out.
  assert.deepEqual(staffTabs({ tabs: ["Category", "Nope", "Order"] }, all, [byName("Order"), byName("Category")]).map((tab) => [tab.resource.name, tab.title]), [
    ["Category", "Categories"],
    ["Order", "Orders"],
  ]);
  // The shop is found by its lines, so `all` has to have them, even where the lines are kept
  // out of the visible list (the phone's `resources` leaves an order's items out).
  const withoutLines = all.filter((resource) => resource.name !== "OrderItem");
  assert.deepEqual(staffTabs(layout, withoutLines), []);
  assert.deepEqual(staffTabs(layout, all, withoutLines).map((tab) => tab.resource.name), ["Order", "Product"]);
  // No shop and none named: no tabs, and each app shows its plain records there.
  assert.deepEqual(staffTabs(layout, [byName("Category")]), []);
});

test("the brand and the theme are what both apps read", () => {
  assert.equal(typeof brand.name, "string");
  assert.ok(themes[theme].light.background && themes[theme].dark.background);
  // Every theme has the same colours, light and dark, so switching can't leave one undefined.
  const keys = Object.keys(themes.neutral.light).sort();
  for (const [name, palettes] of Object.entries(themes)) {
    assert.deepEqual(Object.keys(palettes.light).sort(), keys, name);
    assert.deepEqual(Object.keys(palettes.dark).sort(), keys, name);
  }
});
