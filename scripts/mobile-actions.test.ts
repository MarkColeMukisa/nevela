import assert from "node:assert/strict";
import { test } from "node:test";

import { actionApplies, actionPermission, recordActions } from "../apps/mobile/src/lib/actions.ts";

// The drinks tutorial's orders: buttons that move a placed order on.
const orders = {
  table: "orders",
  actions: {
    accept: { label: "Accept", when: { status: "pending" }, set: { status: "accepted" } },
    cancel: { label: "Cancel order", confirm: "Cancel this order?", when: { status: "pending" }, set: { status: "cancelled" } },
    callOff: { label: "Cancel with a reason", when: { status: ["pending", "accepted", "preparing", "ready"] }, set: { status: "cancelled" }, fields: { reason: { kind: "text" as const } } },
    report: { label: "Export", on: "collection" as const },
  },
};
const customer = { isAdmin: false, permissions: ["orders.view", "orders.create", "orders.cancel"] };
const staff = { isAdmin: false, permissions: ["orders.view", "orders.edit", "orders.accept", "orders.call_off"] };

test("an action's permission is named as Laravel names it", () => {
  assert.equal(actionPermission(orders, "accept"), "orders.accept");
  assert.equal(actionPermission(orders, "callOff"), "orders.call_off");
  assert.equal(actionPermission({ table: "internship_applications" }, "sendAnnouncementNow"), "internship_applications.send_announcement_now");
});

test("when is one value, or a list any of which will do", () => {
  assert.equal(actionApplies(orders.actions.accept, { status: "pending" }), true);
  assert.equal(actionApplies(orders.actions.accept, { status: "accepted" }), false);
  assert.equal(actionApplies(orders.actions.callOff, { status: "ready" }), true);
  assert.equal(actionApplies(orders.actions.callOff, { status: "completed" }), false);
  assert.equal(actionApplies(orders.actions.callOff, { status: null }), false);
  assert.equal(actionApplies({ when: { paid: true } }, { paid: 1 }), true);
  assert.equal(actionApplies({}, {}), true);
});

test("each person sees the buttons they hold, where the order is now", () => {
  const pending = { id: "1", status: "pending" };
  assert.deepEqual(recordActions(customer, orders, pending).map((action) => action.key), ["cancel"]);
  assert.deepEqual(recordActions(staff, orders, pending).map((action) => action.key), ["accept", "callOff"]);
  // Under way: the customer can no longer cancel, and the bar can still call it off.
  const accepted = { id: "1", status: "accepted" };
  assert.deepEqual(recordActions(customer, orders, accepted), []);
  assert.deepEqual(recordActions(staff, orders, accepted).map((action) => action.key), ["callOff"]);
  // An administrator holds them all; an action on the list as a whole is never a record's button.
  assert.deepEqual(recordActions({ isAdmin: true, permissions: [] }, orders, pending).map((action) => action.key), ["accept", "cancel", "callOff"]);
  assert.deepEqual(recordActions(null, orders, pending), []);
});
