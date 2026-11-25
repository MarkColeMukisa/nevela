import assert from "node:assert/strict";
import { test } from "node:test";

import { onSite } from "../apps/web/lib/app.ts";

test("a dashboard address Laravel stored leads to the customer area on the site", () => {
  assert.equal(onSite("/dashboard/account"), "/account");
  assert.equal(onSite("/dashboard/account/security"), "/account/security");
  assert.equal(onSite("/dashboard/account/security?social=linked"), "/account/security?social=linked");
  assert.equal(onSite("/dashboard/orders/7"), "/account/records/orders/7");
  assert.equal(onSite("/dashboard/order-items/01J9Z"), "/account/records/order-items/01J9Z");
});

test("what has no page on the site goes to the account, and anything else is left alone", () => {
  assert.equal(onSite("/dashboard"), "/account");
  assert.equal(onSite("/dashboard/orders"), "/account");
  assert.equal(onSite("/dashboard/orders/new"), "/account");
  assert.equal(onSite("/dashboard/access/users"), "/account");
  assert.equal(onSite("/dashboard/access/users/4"), "/account");
  assert.equal(onSite("/dashboard/trash"), "/account");
  assert.equal(onSite("/dashboard/orders/7/edit"), "/account");
  assert.equal(onSite("/blog/hello"), "/blog/hello");
  assert.equal(onSite("/dashboards"), "/dashboards");
  assert.equal(onSite("https://example.com/dashboard"), "https://example.com/dashboard");
});
