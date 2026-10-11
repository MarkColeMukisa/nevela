import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cutChangelog, hasHeadline, nextVersion } from './release.mjs';

test('bumps by part or takes an explicit version', () => {
  assert.equal(nextVersion('0.1.9', 'patch'), '0.1.10');
  assert.equal(nextVersion('0.1.9', 'minor'), '0.2.0');
  assert.equal(nextVersion('0.1.9', 'major'), '1.0.0');
  assert.equal(nextVersion('0.1.9', '0.3.0'), '0.3.0');
});

test('a first release moves the notes and links to the tag', () => {
  const before = '# Changelog\n\nIntro.\n\n## [Unreleased]\n\n### Added\n\n- First thing.\n';
  const { updated, notes } = cutChangelog(before, '0.1.0', '2026-10-03', null);

  assert.equal(notes, '### Added\n\n- First thing.');
  assert.match(updated, /## \[Unreleased\]\n\n## \[0\.1\.0\] - 2026-10-03\n\n### Added\n\n- First thing\.\n/);
  assert.match(updated, /\[Unreleased\]: .*\/compare\/v0\.1\.0\.\.\.HEAD\n\[0\.1\.0\]: .*\/releases\/tag\/v0\.1\.0\n$/);
});

test('a later release keeps older sections and their links', () => {
  const first = cutChangelog('# Changelog\n\n## [Unreleased]\n\n- One.\n', '0.1.0', '2026-10-03', null).updated;
  const withNotes = first.replace('## [Unreleased]\n', '## [Unreleased]\n\n### Fixed\n\n- Two.\n');
  const { updated } = cutChangelog(withNotes, '0.1.1', '2026-10-04', 'v0.1.0');

  assert.ok(updated.indexOf('## [0.1.1] - 2026-10-04') < updated.indexOf('## [0.1.0] - 2026-10-03'));
  assert.match(updated, /## \[0\.1\.1\] - 2026-10-04\n\n### Fixed\n\n- Two\.\n\n## \[0\.1\.0\]/);
  assert.match(updated, /\[Unreleased\]: .*v0\.1\.1\.\.\.HEAD\n\[0\.1\.1\]: .*compare\/v0\.1\.0\.\.\.v0\.1\.1\n\[0\.1\.0\]: .*releases\/tag\/v0\.1\.0\n$/);
  assert.equal(updated.match(/^\[Unreleased\]: /gm).length, 1);
});

test('a headline is the first line of the notes, in italics, and moves with them', () => {
  const before = '# Changelog\n\n## [Unreleased]\n\n_The trash, for 30 days_\n\n### Added\n\n- A trash.\n';
  const { updated, notes } = cutChangelog(before, '0.1.0', '2026-10-03', null);
  assert.match(updated, /## \[0\.1\.0\] - 2026-10-03\n\n_The trash, for 30 days_\n\n### Added\n/);
  assert.ok(hasHeadline(notes));

  assert.ok(hasHeadline('*Add several records at once*\n\n- One.'));
  assert.ok(!hasHeadline('### Added\n\n- One.'));
  // Bold is an entry that starts strongly, not a headline.
  assert.ok(!hasHeadline('**Breaking** change.\n\n- One.'));
  assert.ok(!hasHeadline('**Breaking change**\n\n- One.'));
  assert.ok(!hasHeadline('__Breaking change__\n\n- One.'));
});
