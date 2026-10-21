// What the dashboard says when it can't talk to the Laravel app properly (apps/web/lib/api-diagnosis.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnose } from "../apps/web/lib/api-diagnosis.ts";

const ok = { status: 200, proxySecret: "ok" };

test("an address without the /api prefix is named, with the one to use", () => {
  const [problem] = diagnose({ apiUrl: "https://x.laravel.cloud", config: { status: 404 }, withApi: 200 });
  assert.match(problem, /NEVELA_API_URL is https:\/\/x\.laravel\.cloud\. Nevela's routes are under \/api: set it to https:\/\/x\.laravel\.cloud\/api\./);
});

test("an address where nothing answers as Nevela says what it should look like", () => {
  for (const withApi of [404, "unreachable", null] as const) {
    const [problem] = diagnose({ apiUrl: "https://wrong.example.com/api", config: { status: 404 }, withApi });
    assert.match(problem, /nothing there answers as Nevela/);
    assert.match(problem, /nevela\.prefix/);
  }
});

test("a Laravel app that can't be reached, or that fails, is said so", () => {
  assert.match(diagnose({ apiUrl: "http://127.0.0.1:8000/api", config: "unreachable", withApi: null })[0], /Can't reach the Laravel app at http:\/\/127\.0\.0\.1:8000\/api/);
  assert.match(diagnose({ apiUrl: "http://127.0.0.1:8000/api", config: { status: 500 }, withApi: null })[0], /answered 500.*laravel\.log/);
});

test("the proxy secret is named when it differs or is set on one side only", () => {
  assert.match(diagnose({ apiUrl: "u", config: { status: 200, proxySecret: "different" }, withApi: null })[0], /isn't the one in the Laravel app's \.env/);
  assert.match(diagnose({ apiUrl: "u", config: { status: 200, proxySecret: "missingInApi" }, withApi: null })[0], /set here and not in the Laravel app/);
  assert.match(diagnose({ apiUrl: "u", config: { status: 200, proxySecret: "missingInDashboard" }, withApi: null })[0], /this dashboard doesn't/);
});

test("all is well: nothing to say, including from a Laravel app too old to report on the secret", () => {
  assert.deepEqual(diagnose({ apiUrl: "u", config: ok, withApi: null }), []);
  assert.deepEqual(diagnose({ apiUrl: "u", config: { status: 200, proxySecret: "none" }, withApi: null }), []);
  assert.deepEqual(diagnose({ apiUrl: "u", config: { status: 200 }, withApi: null }), []);
});
