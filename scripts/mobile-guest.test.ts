import assert from "node:assert/strict";
import { test } from "node:test";

import { comeBackTo, forgetComeBack, readPath, recordKey, takeComeBack } from "../apps/mobile/src/lib/guest.ts";
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

test("a guest is shown the price an order is charged, as named by Laravel", () => {
  const twoPrices = { ...beverage, price: "salePrice", fields: { ...beverage.fields, salePrice: { kind: "float" as const, format: "money" } } };
  assert.equal(findCatalogue([twoPrices])?.price, "salePrice");
  assert.equal(findCatalogue([beverage])?.price, "price");
});

test("an override naming a field that isn't public is left out for a guest, not sent to be refused", () => {
  assert.equal(findCatalogue([category, beverage], { available: "inStock", category: "shelfId" })?.available, "available");
  assert.equal(findCatalogue([category, beverage], { available: "inStock" })?.category, "categoryId");
  assert.equal(findCatalogue([category, beverage], { available: "available" })?.available, "available");
});

test("a guest opens a record by the field its public side reads by, else by its id", () => {
  assert.equal(recordKey({ open: true, by: "slug" }, { id: "1", slug: "mango-juice" }), "mango-juice");
  assert.equal(recordKey({ open: true }, { id: "1", slug: "mango-juice" }), "1");
  assert.equal(recordKey({ by: "slug" }, { id: "1", slug: "mango-juice" }), "1");
  assert.equal(recordKey({ open: true, by: "slug" }, { id: "1" }), "1");
});

test("leaving sign-in to keep browsing forgets where they were going", () => {
  comeBackTo("/shop/abc");
  forgetComeBack();
  assert.equal(takeComeBack(), null);
});
