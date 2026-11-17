import assert from "node:assert/strict";
import { test } from "node:test";

import { describe, keepsFor, opensRecord, timeLeft, type Activity } from "../apps/mobile/src/lib/activity.ts";

const entry = (over: Partial<Activity> = {}): Activity => ({
  id: "1",
  action: "updated",
  label: "Order",
  pluralLabel: "Orders",
  slug: "orders",
  count: 1,
  title: "JM-0001",
  recordId: "abc",
  user: { id: "u1", name: "Mercy Auma" },
  at: "2026-11-17T10:00:00Z",
  ...over,
});

test("a line of the log says who, and what", () => {
  assert.deepEqual(describe(entry(), "u2"), { who: "Mercy Auma", what: "JM-0001" });
  assert.equal(describe(entry(), "u1").who, "You");
  assert.equal(describe(entry({ user: null }), "u1").who, "Someone");
  assert.equal(describe(entry({ title: null }), "u1").what, "an order");
  // Many at once are counted, in the plural the resource gives.
  assert.equal(describe(entry({ count: 12, title: null }), "u1").what, "12 orders");
  assert.equal(describe(entry({ count: 3, title: null, pluralLabel: undefined, label: "Category" }), "u1").what, "3 categorys");
});

test("only a record that is still there is opened", () => {
  assert.equal(opensRecord(entry()), true);
  assert.equal(opensRecord(entry({ action: "deleted" })), false);
  assert.equal(opensRecord(entry({ action: "purged" })), false);
  assert.equal(opensRecord(entry({ count: 2 })), false);
  assert.equal(opensRecord(entry({ recordId: null })), false);
});

test("what is left of a deleted record's time is said in days", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  assert.equal(timeLeft("2026-11-22T12:00:00Z", now), "5 days left");
  assert.equal(timeLeft("2026-11-18T10:00:00Z", now), "1 day left");
  assert.equal(timeLeft("2026-11-17T11:00:00Z", now), "Going soon");
  assert.equal(timeLeft(null, now), "Kept until you remove it");
});

test("how long the trash keeps things is said once", () => {
  assert.equal(keepsFor(30), "Deleted records are kept for 30 days, then removed for good.");
  assert.equal(keepsFor(1), "Deleted records are kept for a day, then removed for good.");
  assert.match(keepsFor(null), /until someone removes/);
});
