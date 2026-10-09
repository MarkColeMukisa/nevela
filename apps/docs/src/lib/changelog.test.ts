import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { byWeek, headlineOf, inline, releasesIn, weekLabel } from "./changelog.ts";

const day = (date: string) => new Date(`${date}T00:00:00Z`);

test("a release is called by the line in italics under its heading", () => {
  assert.equal(headlineOf("\n_The trash: deleted records, restorable for 30 days_\n\n### Added\n\n- **The trash.** A deleted record is kept.\n"), "The trash: deleted records, restorable for 30 days");
  assert.equal(headlineOf("*Add several records at once*\n\n- One.\n"), "Add several records at once");
  // Code in it keeps its underscores.
  assert.equal(headlineOf("_`require_email_verification` is honoured_\n\n- One.\n"), "`require_email_verification` is honoured");
});

test("one with no such line is called by the first thing it lists", () => {
  assert.equal(headlineOf("### Added\n\n- **Insights**, above every resource's table: a panel.\n- More.\n"), "Insights");
  assert.equal(headlineOf("### Fixed\n\n- Generated files could be written with Windows line endings. And more about it.\n"), "Generated files could be written with Windows line endings");
  const long = headlineOf(`### Fixed\n\n- ${"word ".repeat(40)}\n`);
  assert.ok(long.length <= 90 && long.endsWith("…"), long);
  // A bold line is an entry, not a headline.
  assert.equal(headlineOf("**Breaking** change here.\n\n- The real first entry.\n"), "The real first entry");
});

test("every release in the file is found, newest first, and Unreleased is not one", () => {
  const found = releasesIn("# Changelog\n\n## [Unreleased]\n\n- Not out yet.\n\n## [0.2.0] - 2026-10-05\n\n_Second_\n\n- B.\n\n## [0.1.0] - 2026-10-03\n\n- **First.** A.\n\n[0.1.0]: https://example.com\n");
  assert.deepEqual(found, [
    { version: "0.2.0", date: "2026-10-05", headline: "Second" },
    { version: "0.1.0", date: "2026-10-03", headline: "First" },
  ]);
});

test("a week runs Monday to Sunday and is named by its days", () => {
  assert.equal(weekLabel(day("2026-10-05")), "October 5 to 11, 2026");
  assert.equal(weekLabel(day("2026-09-28")), "September 28 to October 4, 2026");
  assert.equal(weekLabel(day("2026-12-28")), "December 28, 2026 to January 3, 2027");
});

test("releases are grouped by the week they came out in, keeping their order", () => {
  const releases = [
    { version: "0.3.0", date: "2026-10-11", headline: "Sunday" },
    { version: "0.2.0", date: "2026-10-05", headline: "Monday" },
    { version: "0.1.0", date: "2026-10-04", headline: "The Sunday before" },
  ];
  const weeks = byWeek(releases);
  assert.deepEqual(weeks.map((week) => [week.start, week.label, week.releases.map((release) => release.version)]), [
    ["2026-10-05", "October 5 to 11, 2026", ["0.3.0", "0.2.0"]],
    ["2026-09-28", "September 28 to October 4, 2026", ["0.1.0"]],
  ]);
});

test("a headline is escaped, and its code is code", () => {
  assert.equal(inline('`nevela update` said "done" & <stopped>'), "<code>nevela update</code> said &quot;done&quot; &amp; &lt;stopped&gt;");
});

test("the repository's own changelog: every release has a headline of its own, short enough for one line", () => {
  const releases = releasesIn(fs.readFileSync(new URL("../../../../CHANGELOG.md", import.meta.url), "utf8"));
  assert.ok(releases.length >= 20);
  for (const release of releases) {
    assert.ok(release.headline.length > 0 && release.headline.length <= 70, `${release.version}: "${release.headline}"`);
  }
  assert.equal(new Set(releases.map((release) => release.headline)).size, releases.length);
});
