import assert from "node:assert/strict";
import { test } from "node:test";

import { actionName, actionsOf, can, changedGrants, featureToggled, grantsFrom, heldOf, rolesLine, rolesToggled, toggled, usesPatterns } from "../apps/mobile/src/lib/access.ts";

const orders = { key: "orders", name: "Orders", actions: ["create", "view", "edit", "delete", "cancel"], labels: { cancel: "Cancel an order" } };

test("the four usual actions come first, in reading order, then the resource's own", () => {
  assert.deepEqual(actionsOf(orders), ["view", "create", "edit", "delete", "cancel"]);
  assert.equal(actionName(orders, "cancel"), "Cancel an order");
  assert.equal(actionName(orders, "view"), "View");
});

test("an administrator holds everything, anyone else what they were given", () => {
  assert.equal(can({ isAdmin: true, permissions: [] }, "users.edit"), true);
  assert.equal(can({ isAdmin: false, permissions: ["users.view"] }, "users.view"), true);
  assert.equal(can({ isAdmin: false, permissions: ["users.view"] }, "users.edit"), false);
  assert.equal(can(null, "users.view"), false);
});

test("a permission is switched on once and off again", () => {
  const on = toggled(["orders.view"], "orders.edit", true);
  assert.deepEqual(on, ["orders.view", "orders.edit"]);
  assert.deepEqual(toggled(on, "orders.edit", true).filter((key) => key === "orders.edit"), ["orders.edit"]);
  assert.deepEqual(toggled(on, "orders.view", false), ["orders.edit"]);
});

test("all of a feature is switched on only as far as the person may give it, and off whatever they hold", () => {
  const mine = (key: string) => key !== "orders.delete";
  const given = featureToggled([], orders, true, mine);
  assert.equal(given.includes("orders.delete"), false);
  assert.equal(heldOf(given, orders), 4);
  assert.deepEqual(featureToggled(given, orders, false, mine), []);
  // Something they may not give is still taken away.
  assert.deepEqual(featureToggled(["orders.delete"], orders, false, mine), []);
});

test("what is sent as a role's grants is each permission once, in a steady order", () => {
  assert.deepEqual(grantsFrom(["orders.view", "beverages.view", "orders.view"]), ["beverages.view", "orders.view"]);
  const role = { permissions: ["orders.view", "beverages.view"] };
  assert.equal(changedGrants(role, ["beverages.view", "orders.view"]), false);
  assert.equal(changedGrants(role, ["beverages.view"]), true);
});

test("a role written with patterns is told apart", () => {
  assert.equal(usesPatterns({ grants: ["orders.*"] }), true);
  assert.equal(usesPatterns({ grants: ["orders.view"] }), false);
});

test("people and their roles are named plainly", () => {
  assert.equal(rolesLine({ roles: [{ id: "1", name: "STAFF" }, { id: "2", name: "CUSTOMER" }] }), "STAFF, CUSTOMER");
  assert.equal(rolesLine({ roles: [] }), "No role");
  assert.deepEqual(rolesToggled(["a"], "b"), ["a", "b"]);
  assert.deepEqual(rolesToggled(["a", "b"], "a"), ["b"]);
});
