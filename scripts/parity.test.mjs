// Checks scripts/parity.json against the two apps' code: a route said to be used by the
// dashboard, the phone, or both, is named in that app's code, and one said to be the
// dashboard's alone isn't named in the phone's (and the other way round). The list itself is
// checked against Laravel's routes by apps/api/tests/Feature/ParityTest.php.
//
// It reads the code, so it sees addresses as they are written: "/_nevela/users",
// `_nevela/users/${id}`, `${resource.slug}/_bulk`. The dashboard's sign-in calls are written
// without their "auth/" (apps/web/lib/auth-client.ts), and are looked for that way there.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "scripts/parity.json"), "utf8"));

function read(dirs) {
  const files = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|mjs|js)$/.test(entry.name) && !/\.test\./.test(entry.name)) files.push(full);
    }
  };
  for (const dir of dirs) walk(path.join(root, dir));
  return files.map((file) => ({ file: path.relative(root, file).replace(/\\/g, "/"), text: fs.readFileSync(file, "utf8") }));
}

const shared = ["packages/shared/src"];
const code = {
  web: read(["apps/web/app", "apps/web/lib", "apps/web/components", "apps/web/hooks", ...shared]),
  phone: read(["apps/mobile/src", ...shared]),
};
// Where the dashboard names a sign-in call without "auth/".
const webAuth = code.web.filter(({ file }) => file === "apps/web/lib/auth-client.ts" || file.startsWith("apps/web/app/api/auth/") || file === "apps/web/app/auth-actions.ts");

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A route's address as code writes it: each {part} a ${…} expression or a word. */
function pattern(address) {
  const parts = address.split("/").map((part) => (/^\{.+\}$/.test(part) ? "(?:\\$\\{[^}]*\\}|[A-Za-z0-9_.:-]+)" : escape(part)));
  return new RegExp(`(?:^|[\`"'/])${parts.join("/")}(?=[\`"'?])`);
}

function seenIn(side, address) {
  const regex = pattern(address);
  if (code[side].some(({ text }) => regex.test(text))) return true;
  if (side === "web" && address.startsWith("auth/")) {
    const bare = pattern(address.slice("auth/".length));
    return webAuth.some(({ text }) => bare.test(text));
  }
  return false;
}

const SIDES = ["web", "phone", "none", "linked"];
const entries = Object.entries(manifest.routes).map(([key, value]) => {
  const [method, address] = key.split(" ");
  const side = value === "both" ? "both" : Object.keys(value)[0];
  return { key, method, address, side, why: value === "both" ? null : value[side] };
});

test("each line says both, or which side has it and why the other hasn't", () => {
  for (const { key, side, why } of entries) {
    assert.ok(/^(GET|POST|PUT|PATCH|DELETE) \S+$/.test(key), `${key}: "METHOD address"`);
    if (side === "both") continue;
    assert.ok(SIDES.includes(side), `${key}: one of both, ${SIDES.join(", ")}`);
    assert.ok(typeof why === "string" && why.length > 20, `${key}: give the reason the other side has none`);
  }
  for (const [kind, value] of Object.entries(manifest.kinds)) {
    if (value === "both") continue;
    const [side] = Object.keys(value);
    assert.ok(["web", "partly"].includes(side), `kind ${kind}: both, web or partly`);
    assert.ok(value[side].length > 20, `kind ${kind}: give the reason`);
  }
});

test("what is said to be used is named in that app's code", () => {
  const missing = [];
  for (const { key, address, side } of entries) {
    for (const app of side === "both" ? ["web", "phone"] : side === "web" || side === "phone" ? [side] : []) {
      if (!seenIn(app, address)) missing.push(`${key} (${app})`);
    }
  }
  assert.deepEqual(missing, [], "Said to be used, and not found in the app's code. Fix the line in scripts/parity.json, or the app.");
});

test("what is said to be one app's alone isn't named in the other's", () => {
  // Read by address, not by method: a side's claim only counts where no other line with the
  // same address is said to be used by the other app.
  const usedBy = (app, address) => entries.some((entry) => entry.address === address && (entry.side === "both" || entry.side === app));
  const found = [];
  for (const { key, address, side } of entries) {
    const other = side === "web" ? "phone" : side === "phone" ? "web" : null;
    if (other && !usedBy(other, address) && seenIn(other, address)) found.push(`${key} (found in ${other})`);
  }
  assert.deepEqual(found, [], "Said to be one app's alone, and the other uses it now. Make the line \"both\" in scripts/parity.json.");
});
