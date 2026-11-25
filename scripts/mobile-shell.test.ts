import assert from "node:assert/strict";
import { test } from "node:test";

import { shellFor } from "../apps/mobile/src/lib/shell.ts";

const user = (roles: string[], isAdmin = false) => ({ roles, isAdmin });

test("someone who holds only the role new sign-ups start with is a customer", () => {
  assert.equal(shellFor(user(["USER"]), "USER"), "customer");
  assert.equal(shellFor(user(["CUSTOMER"]), "CUSTOMER"), "customer");
  // However the role is capitalised: the API matches role names without regard to case.
  assert.equal(shellFor(user(["customer"]), "CUSTOMER"), "customer");
});

test("anyone who holds another role as well, and every administrator, is staff", () => {
  assert.equal(shellFor(user(["CUSTOMER", "STAFF"]), "CUSTOMER"), "staff");
  assert.equal(shellFor(user(["EDITOR"]), "USER"), "staff");
  assert.equal(shellFor(user(["ADMIN"], true), "ADMIN"), "staff");
  assert.equal(shellFor(user(["USER"], true), "USER"), "staff");
});

test("an account with no role at all has nothing staff-like, so it is a customer", () => {
  assert.equal(shellFor(user([]), "USER"), "customer");
});

test("when the API doesn't say, or nobody is signed in, everyone is staff, as the app was before it had customers", () => {
  assert.equal(shellFor(user(["USER"]), null), "staff");
  assert.equal(shellFor(user(["USER"]), undefined), "staff");
  assert.equal(shellFor(user(["USER"]), ""), "staff");
  assert.equal(shellFor(null, "USER"), "staff");
});

test("what the API says about someone wins over working it out here", () => {
  assert.equal(shellFor({ roles: ["USER"], isAdmin: false, staff: true }, "USER"), "staff");
  assert.equal(shellFor({ roles: ["EDITOR"], isAdmin: false, staff: false }, "USER"), "customer");
  assert.equal(shellFor({ roles: ["USER"], isAdmin: false, staff: false }, null), "customer");
});
