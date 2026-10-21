// What the dashboard says when it can't talk to the Laravel app properly (apps/web/lib/api-diagnosis.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnose, isNevelaConfig } from "../apps/web/lib/api-diagnosis.ts";

const nevela = (proxySecret?: string) => ({ status: 200, nevela: true, proxySecret });

test("an address without the /api prefix is named, with the one to use", () => {
  const [problem] = diagnose({ apiUrl: "https://x.laravel.cloud", config: { status: 404, nevela: false }, nevelaUnderApi: true });
  assert.match(problem, /NEVELA_API_URL is https:\/\/x\.laravel\.cloud\. Nevela's routes are under \/api: set it to https:\/\/x\.laravel\.cloud\/api\./);
});

test("an address where nothing answers as Nevela says what it should look like", () => {
  for (const nevelaUnderApi of [false, null]) {
    const [problem] = diagnose({ apiUrl: "https://wrong.example.com/api", config: { status: 404, nevela: false }, nevelaUnderApi });
    assert.match(problem, /nothing there answers as Nevela \(auth\/config is not found\)/);
    assert.match(problem, /nevela\.prefix/);
  }
});

test("a page that answers 200 but isn't Nevela's settings is not taken for Nevela", () => {
  // A host that answers every path with a page, or the dashboard pointed at itself.
  for (const body of [null, "<!doctype html>", {}, { ok: true }, { passkeys: true }, { passkeys: true, twoFactor: {}, social: "no" }]) {
    assert.equal(isNevelaConfig(body), false, JSON.stringify(body));
  }
  assert.equal(isNevelaConfig({ passkeys: true, twoFactor: { authenticator: true, email: true }, social: [], proxySecret: "ok" }), true);

  const [problem] = diagnose({ apiUrl: "https://app.example.com", config: { status: 200, nevela: false }, nevelaUnderApi: false });
  assert.match(problem, /nothing there answers as Nevela \(auth\/config isn't Nevela's\)/);
  assert.match(diagnose({ apiUrl: "https://x.laravel.cloud", config: { status: 200, nevela: false }, nevelaUnderApi: true })[0], /set it to https:\/\/x\.laravel\.cloud\/api/);
});

test("a Laravel app that can't be reached, or that fails, is said so", () => {
  assert.match(diagnose({ apiUrl: "http://127.0.0.1:8000/api", config: "unreachable", nevelaUnderApi: null })[0], /Can't reach the Laravel app at http:\/\/127\.0\.0\.1:8000\/api/);
  assert.match(diagnose({ apiUrl: "http://127.0.0.1:8000/api", config: { status: 500, nevela: false }, nevelaUnderApi: null })[0], /answered 500.*laravel\.log/);
});

test("the proxy secret is named when it differs or is set on one side only", () => {
  assert.match(diagnose({ apiUrl: "u", config: nevela("different"), nevelaUnderApi: null })[0], /isn't the one in the Laravel app's \.env/);
  assert.match(diagnose({ apiUrl: "u", config: nevela("missingInApi"), nevelaUnderApi: null })[0], /set here and not in the Laravel app/);
  assert.match(diagnose({ apiUrl: "u", config: nevela("missingInDashboard"), nevelaUnderApi: null })[0], /this dashboard doesn't/);
});

test("all is well: nothing to say, including from a Laravel app too old to report on the secret", () => {
  assert.deepEqual(diagnose({ apiUrl: "u", config: nevela("ok"), nevelaUnderApi: null }), []);
  assert.deepEqual(diagnose({ apiUrl: "u", config: nevela("none"), nevelaUnderApi: null }), []);
  assert.deepEqual(diagnose({ apiUrl: "u", config: nevela(), nevelaUnderApi: null }), []);
});
