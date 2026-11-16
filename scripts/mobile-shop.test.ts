import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { formatMoney, currencyDigits } from "../apps/mobile/src/lib/money.ts";
import { addToCart, cartCount, cartTotal, clampQuantity, findShop, NOT_AVAILABLE, OFF_THE_TRAIL, orderLines, prefillFrom, setQuantity, sortIssues, totalFieldOf } from "../apps/mobile/src/lib/shop.ts";

/** The repository's own example resources, as `GET _nevela/resources` sends them. */
function repositoryResources(): any[] {
  const dir = path.resolve(import.meta.dirname, "../apps/api/nevela/resources");
  return fs.readdirSync(dir).filter((file) => file.endsWith(".json")).map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
}

const byName = (name: string) => repositoryResources().find((resource) => resource.name === name);

test("money is written in its currency with that currency's own decimals, as the dashboard writes it", () => {
  // (Intl puts a non-breaking space after the code, as it does in the dashboard.)
  const plain = (text: string | null) => text?.replace(/\u00a0/g, " ");
  assert.equal(plain(formatMoney(4500, "UGX")), "UGX 4,500");
  assert.equal(plain(formatMoney(4500.5, "USD")), "$4,500.50");
  assert.equal(currencyDigits("UGX"), 0);
  assert.equal(currencyDigits("USD"), 2);
  assert.equal(currencyDigits(undefined), 2);
  // Nothing to write it in, or not a number: the caller shows it plainly.
  assert.equal(formatMoney(4500, undefined), null);
  assert.equal(formatMoney("abc", "UGX"), null);
  assert.equal(formatMoney(null, "UGX"), null);
  assert.equal(formatMoney(4500, "NOTACURRENCY"), null);
});

test("the repository's own Order is not a shop until its status has a default: a required field nobody can be asked is no order to place", () => {
  assert.equal(findShop(repositoryResources()), null);
});

test("it is a shop once the status is sent, and it is found with nothing written down", () => {
  const shop = findShop(repositoryResources(), { send: { status: "pending" } });
  assert.ok(shop);
  assert.equal(shop.orders.name, "Order");
  assert.equal(shop.lines.name, "OrderItem");
  assert.equal(shop.catalogue.name, "Product");
  assert.deepEqual([shop.link, shop.product, shop.quantity], ["orderId", "productId", "quantity"]);
  assert.equal(shop.price, "price"); // the line's price is copied from productId.price
  assert.equal(shop.title, "name");
  assert.equal(shop.image, "image");
  assert.equal(shop.category, "categoryId");
  assert.equal(shop.available, "active");
  // The customer is asked for who and where, never for the number, the total or the status.
  assert.deepEqual(shop.checkout, ["customer", "email", "phone", "notes"]);
});

test("a status with a default is the shop's to decide, and leaves the checkout without it", () => {
  const resources = repositoryResources();
  const order = resources.find((resource) => resource.name === "Order");
  order.fields.status = { kind: "enum", options: ["pending", "paid"], default: "pending" };
  const shop = findShop(resources);
  assert.ok(shop);
  assert.ok(!shop.checkout.includes("status"));
  assert.deepEqual(shop.send, {});
});

test("what an order has to have is never quietly dropped: asked for, sent, or there is no shop", () => {
  const resources = repositoryResources();
  const order = resources.find((resource) => resource.name === "Order");
  // A required field the phone can't be given by a customer: a file.
  order.fields.status = { kind: "enum", options: ["pending"], default: "pending" };
  order.fields.idScan = { kind: "file", accept: ["image"] };
  assert.equal(findShop(resources), null);
  // Unless the app says it is sent, or optional.
  assert.ok(findShop(resources, { send: { idScan: "x" } }));
  order.fields.idScan = { kind: "file", accept: ["image"], required: false };
  assert.ok(findShop(resources));
});

test("an app can say how its shop differs", () => {
  const shop = findShop(repositoryResources(), { send: { status: "pending" }, checkout: ["customer", "phone"], available: "active", category: "categoryId" });
  assert.deepEqual(shop?.checkout, ["customer", "phone"]);
  // Naming a field that isn't there is not a shop either.
  assert.equal(findShop(repositoryResources(), { send: { status: "pending" }, checkout: ["nonsense"] }), null);
});

test("without lines that point at something sold there is no shop", () => {
  const resources = repositoryResources().filter((resource) => resource.name !== "Product");
  assert.equal(findShop(resources, { send: { status: "pending" } }), null);
  assert.equal(findShop([], {}), null);
  assert.equal(findShop(repositoryResources().filter((resource) => resource.name !== "OrderItem")), null);
});

test("the customer's own details start the checkout", () => {
  assert.equal(prefillFrom({ kind: "string" }, "customer"), "name");
  assert.equal(prefillFrom({ kind: "string" }, "fullName"), "name");
  assert.equal(prefillFrom({ kind: "string", format: "email" }, "email"), "email");
  assert.equal(prefillFrom({ kind: "string", format: "tel" }, "phone"), null);
  assert.equal(prefillFrom({ kind: "string" }, "sku"), null);
});

test("the cart adds, changes and removes, and totals what it holds", () => {
  const kettle = { id: "k", title: "Kettle", price: 20, image: null };
  const lamp = { id: "l", title: "Lamp", price: 5.5, image: null };
  let cart = addToCart([], kettle);
  cart = addToCart(cart, lamp, 2);
  cart = addToCart(cart, kettle); // one more of what is there
  assert.deepEqual(cart.map((line) => [line.id, line.quantity]), [["k", 2], ["l", 2]]);
  assert.equal(cartCount(cart), 4);
  assert.deepEqual(cartTotal(cart), { amount: 51, complete: true });

  cart = setQuantity(cart, "l", 5);
  assert.equal(cart.find((line) => line.id === "l")?.quantity, 5);
  assert.equal(setQuantity(cart, "k", 0).length, 1);
  assert.equal(setQuantity(cart, "k", -3).length, 1);

  // A price that isn't known is said, not counted as nothing.
  assert.deepEqual(cartTotal(addToCart(cart, { id: "x", title: "Mystery", price: null, image: null })), { amount: 20 * 2 + 5.5 * 5, complete: false });
  assert.deepEqual(cartTotal([]), { amount: 0, complete: true });
});

test("a quantity is a whole number from one to ninety-nine", () => {
  assert.equal(clampQuantity(0), 1);
  assert.equal(clampQuantity(2.6), 3);
  assert.equal(clampQuantity(5000), 99);
  assert.equal(clampQuantity(Number.NaN), 1);
  assert.equal(addToCart([{ id: "a", quantity: 98, title: "A", price: 1, image: null }], { id: "a", title: "A", price: 1, image: null }, 5)[0].quantity, 99);
});

test("an order is sent with each line's product and quantity, and not its price", () => {
  const shop = findShop(repositoryResources(), { send: { status: "pending" } });
  assert.ok(shop);
  const lines = orderLines(shop, [{ id: "p1", quantity: 2, title: "Kettle", price: 20, image: null }]);
  assert.deepEqual(lines, [{ productId: "p1", quantity: 2 }]);
});

test("a mistake in a line is shown on that line, and the rest are about the order", () => {
  const sorted = sortIssues([
    { path: "items.1.quantity", message: "The quantity must be at least 1." },
    { path: "items.1.productId", message: "That product doesn't exist." },
    { path: "items.0.productId", message: "No longer available." },
    { path: "items", message: "Add something to your order." },
    { path: "customer", message: "The customer field is required." },
  ]);
  assert.deepEqual(sorted.lines[1], ["The quantity must be at least 1.", "That product doesn't exist."]);
  assert.deepEqual(sorted.lines[0], ["No longer available."]);
  assert.deepEqual(sorted.order.map((issue) => issue.path), ["items", "customer"]);
});

test("a complaint about what was bought is told to the customer as \"not available\", whatever Laravel said", () => {
  const issues = [
    { path: "items.1.productId", message: "This one is in the trash. Restore it, or choose another." },
    { path: "items.1.productId", message: "The selected product is invalid." },
    { path: "items.1.quantity", message: "The quantity must be at least 1." },
  ];
  const sorted = sortIssues(issues, "productId");
  assert.deepEqual(sorted.lines[1], [NOT_AVAILABLE, "The quantity must be at least 1."]);
  // Without being told which field it is, Laravel's own words stand.
  assert.equal(sortIssues(issues).lines[1][0], "This one is in the trash. Restore it, or choose another.");
});

test("the order's total is the money field named like one, not the first money field", () => {
  const orders = { fields: { deliveryFee: { kind: "float", format: "money" }, total: { kind: "float", format: "money" } } } as never;
  assert.equal(totalFieldOf(orders)?.[0], "total");
  const unnamed = { fields: { fee: { kind: "float", format: "money" }, sum: { kind: "float", format: "money" } } } as never;
  assert.equal(totalFieldOf(unnamed)?.[0], "fee");
});

test("cancelled and the like are not stages on the trail", () => {
  assert.ok(OFF_THE_TRAIL.test("cancelled"));
  assert.ok(OFF_THE_TRAIL.test("rejected"));
  assert.ok(!OFF_THE_TRAIL.test("completed"));
});
