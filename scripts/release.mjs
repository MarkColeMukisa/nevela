#!/usr/bin/env node
// Prepare a Nevela release: move the changelog's Unreleased notes under a new version
// and write that version everywhere it is recorded.
//
//   pnpm release patch | minor | major | 1.2.3   [--dry-run]
//
// It only edits files. Committing, tagging and pushing stay with you; the commands are
// printed at the end. See apps/docs/src/content/docs/contributing/releasing.md.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'https://github.com/MarkColeMukisa/nevela';

/** Every place the version is written down. One number for the whole repository. */
const VERSION_FILES = [
  { file: 'package.json', pattern: /("version":\s*")(\d+\.\d+\.\d+)(")/ },
  { file: 'apps/web/package.json', pattern: /("version":\s*")(\d+\.\d+\.\d+)(")/ },
  { file: 'packages/create-nevela/package.json', pattern: /("version":\s*")(\d+\.\d+\.\d+)(")/ },
  { file: 'packages/laravel/src/Nevela.php', pattern: /(public const VERSION = ')(\d+\.\d+\.\d+)(')/ },
];

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function parse(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? match.slice(1).map(Number) : null;
}

function compare(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export function nextVersion(current, bump) {
  const [major, minor, patch] = parse(current);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (!parse(bump)) fail(`"${bump}" is not patch, minor, major or a version like 1.2.3.`);
  if (compare(parse(bump), parse(current)) < 0) fail(`${bump} is lower than the current version ${current}.`);
  return bump;
}

/**
 * Move what is under "## [Unreleased]" to a new "## [version] - date" section, leave
 * Unreleased empty, and repoint the comparison links at the bottom of the file.
 */
export function cutChangelog(changelog, version, date, previousTag) {
  const text = changelog.replace(/\r\n/g, '\n');
  const start = text.indexOf('## [Unreleased]');
  if (start === -1) fail('CHANGELOG.md has no "## [Unreleased]" section.');
  if (text.includes(`## [${version}]`)) fail(`CHANGELOG.md already has a section for ${version}.`);

  const bodyStart = text.indexOf('\n', start) + 1;
  const rest = text.slice(bodyStart);
  const next = rest.search(/^(## \[|\[[^\]]+\]: )/m);
  const body = (next === -1 ? rest : rest.slice(0, next)).trim();
  const after = next === -1 ? '' : rest.slice(next);
  if (!body) fail('Nothing is listed under "## [Unreleased]" in CHANGELOG.md. Write the notes first.');

  const withoutLinks = after.replace(/^\[[^\]]+\]: .*\n?/gm, '').trimEnd();
  const olderLinks = (after.match(/^\[\d+\.\d+\.\d+\]: .*$/gm) ?? []).join('\n');
  const links = [
    `[Unreleased]: ${REPO}/compare/v${version}...HEAD`,
    previousTag ? `[${version}]: ${REPO}/compare/${previousTag}...v${version}` : `[${version}]: ${REPO}/releases/tag/v${version}`,
    olderLinks,
  ].filter(Boolean).join('\n');

  const updated = `${text.slice(0, bodyStart)}\n## [${version}] - ${date}\n\n${body}\n${withoutLinks ? `\n${withoutLinks}\n` : ''}\n${links}\n`;
  return { updated, notes: body };
}

/** The newest version that already has a section, as a tag name, or null for a first release. */
function previousTagIn(changelog) {
  const match = /^## \[(\d+\.\d+\.\d+)\]/m.exec(changelog);
  return match ? `v${match[1]}` : null;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const bump = args.find((arg) => !arg.startsWith('--'));
  if (!bump) fail('Usage: pnpm release <patch|minor|major|x.y.z> [--dry-run]');

  const current = JSON.parse(read('package.json')).version;
  for (const { file, pattern } of VERSION_FILES) {
    const found = pattern.exec(read(file))?.[2];
    if (found !== current) fail(`${file} says ${found ?? 'no version'}, but package.json says ${current}. Make them agree first.`);
  }

  const changelog = read('CHANGELOG.md');
  const previousTag = previousTagIn(changelog);
  // The first release may keep the version the files already carry.
  if (previousTag && parse(bump) && compare(parse(bump), parse(current)) === 0) fail(`${current} is already released. Pick a higher version.`);
  const version = nextVersion(current, bump);
  const date = new Date().toISOString().slice(0, 10);
  const { updated, notes } = cutChangelog(changelog, version, date, previousTag);

  console.log(`\n  ${current} → ${version}${dryRun ? '  (dry run, nothing written)' : ''}\n`);
  console.log(notes.split('\n').map((line) => `  ${line}`).join('\n'));

  if (!dryRun) {
    fs.writeFileSync(path.join(root, 'CHANGELOG.md'), updated);
    for (const { file, pattern } of VERSION_FILES) {
      fs.writeFileSync(path.join(root, file), read(file).replace(pattern, `$1${version}$3`));
    }
  }

  console.log(`
  ${dryRun ? 'Would update' : 'Updated'}: CHANGELOG.md, ${VERSION_FILES.map(({ file }) => file).join(', ')}

  Next, when you're happy with the diff:

    git add CHANGELOG.md ${VERSION_FILES.map(({ file }) => file).join(' ')}
    git commit -m "Release v${version}"
    git tag v${version}
    git push origin main --follow-tags
`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
