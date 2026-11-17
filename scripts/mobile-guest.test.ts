import assert from "node:assert/strict";
import { test } from "node:test";

import { comeBackTo, readPath, takeComeBack } from "../apps/mobile/src/lib/guest.ts";
import { findCatalogue } from "../apps/mobile/src/lib/shop.ts";

// What GET public/_nevela/resources answers for the drinks tutorial with a public menu.
const beverage = {
  name: "Beverage",
  table: "beverages",
  slug: "beverages",
  label: "Beverage",
  pluralLabel: "Beverages",
  sold: true,
  open: true,
  fields: {
    name: { kind: "string" as const },
    description: { kind: "text" as const, required: false as const },
    price: { kind: "float" as const, format: "money", currency: "UGX" },
    image: { kind: "file" as const, accept: ["image"], required: false as const },
    categoryId: { kind: "belongsTo" as const, target: "Category" },
    available: { kind: "boolean" as const },
  },
};
const category = { name: "Category", table: "categories", slug: "categories", label: "Category", pluralLabel: "Categories", open: true, fields: { name: { kind: "string" as const } } };

test("a guest browses what Laravel says is sold, shown as the shop would show it", () => {
  const found = findCatalogue([category, beverage]);
  assert.ok(found);
  assert.equal(found.catalogue.name, "Beverage");
  assert.equal(found.title, "name");
  assert.equal(found.price, "price");
  assert.equal(found.image, "image");
  assert.equal(found.description, "description");
  assert.equal(found.category, "categoryId");
  assert.equal(found.available, "available");
});

test("with nothing sold open to anyone, there is nothing to browse and the app opens on signing in", () => {
  assert.equal(findCatalogue([]), null);
  assert.equal(findCatalogue([category]), null);
});

test("a category that isn't open to guests isn't offered to narrow by", () => {
  assert.equal(findCatalogue([beverage])?.category, null);
});

test("a guest's reads go to the public routes, and a signed-in person's don't", () => {
  assert.equal(readPath(beverage), "/public/beverages");
  assert.equal(readPath(beverage, "/abc"), "/public/beverages/abc");
  assert.equal(readPath({ slug: "beverages" }, "/abc"), "/beverages/abc");
});

test("signing in goes back to what they were adding, once, and only somewhere in the app", () => {
  comeBackTo("/shop/abc");
  assert.equal(takeComeBack(), "/shop/abc");
  assert.equal(takeComeBack(), null);
  comeBackTo("//evil.example/x");
  assert.equal(takeComeBack(), null);
  comeBackTo("https://evil.example/x");
  assert.equal(takeComeBack(), null);
});
