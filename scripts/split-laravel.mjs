#!/usr/bin/env node
// Copy packages/laravel, with its history, to the repository Packagist reads.
//
//   pnpm split:laravel            push main
//   pnpm split:laravel v0.2.0     push main and that release tag
//
// Packagist needs composer.json at the root of a repository, so nevela/laravel is
// published from a read-only copy of this folder. Run this after merging to main, and
// again with the tag after a release. It uses your own git credentials; nothing is stored.
// The same thing runs in CI once a token is configured (.github/workflows/split-laravel.yml).

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = 'packages/laravel';
const TARGET = process.env.LARAVEL_SPLIT_REPO || 'MarkColeMukisa/nevela-laravel';
const remote = `https://github.com/${TARGET}.git`;

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

function git(args, { quiet = false } = {}) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    if (quiet) return null;
    fail(`git ${args.join(' ')} failed:\n${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
}

/** The commit that holds only packages/laravel as it was at `ref`. Same input, same commit. */
function split(ref) {
  const sha = git(['subtree', 'split', `--prefix=${PREFIX}`, ref]);
  if (!/^[0-9a-f]{40}$/.test(sha.split('\n').pop())) fail(`Couldn't split ${PREFIX} at ${ref}.`);
  return sha.split('\n').pop();
}

const tag = process.argv[2];
if (tag && !/^v\d+\.\d+\.\d+$/.test(tag)) fail(`"${tag}" isn't a release tag. Use the form v1.2.3.`);

// Always from origin/main, not from whatever is checked out: the copy mirrors what is merged.
git(['fetch', '--quiet', 'origin', 'main', '--tags']);
if (tag && git(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], { quiet: true }) === null) {
  fail(`There is no tag ${tag} here. Tag the release first (see the Releasing page).`);
}

console.log(`\n  Splitting ${PREFIX} from origin/main…`);
const main = split('origin/main');
git(['push', remote, `${main}:refs/heads/main`, '--force']);
console.log(`  ✔ ${TARGET} main → ${main.slice(0, 7)}`);

if (tag) {
  const tagged = split(tag);
  git(['push', remote, `${tagged}:refs/tags/${tag}`, '--force']);
  console.log(`  ✔ ${TARGET} ${tag} → ${tagged.slice(0, 7)}`);
  console.log('\n  Packagist picks the new version up from the tag within a few minutes.');
}
console.log('');
