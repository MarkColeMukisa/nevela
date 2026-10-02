---
title: "Releasing"
description: "How versions are numbered, how the changelog is kept, and how to cut a release."
---

How Nevela is versioned, how the changelog is kept, and how to cut a release.

## One version for the whole repository

The Laravel package, the web app and the docs are released together under one number. It is recorded in three places, and `pnpm release` keeps them the same:

| File | Where |
|---|---|
| `package.json` | `"version"` |
| `apps/web/package.json` | `"version"` |
| `packages/laravel/src/Nevela.php` | `Nevela::VERSION` |

A release is a git tag named `v` plus the version, such as `v0.2.0`.

## Choosing the number

Nevela follows [Semantic Versioning](https://semver.org).

| Bump | When | Example |
|---|---|---|
| `patch` | Bug fixes only. Nothing a user has to change. | 0.2.0 → 0.2.1 |
| `minor` | New features that keep existing apps working. | 0.2.1 → 0.3.0 |
| `major` | A change that breaks existing apps. | 0.3.0 → 1.0.0 |

Until 1.0.0, a `minor` release may also contain breaking changes. Mark each one **Breaking** in the changelog and say what to do about it.

Changes that count as breaking for Nevela:

- a generated file's shape changes so that regenerating needs manual work
- a REST endpoint, parameter or response field is renamed or removed
- a command or option is renamed or removed
- a key in the descriptor JSON or `config/nevela.php` is renamed or removed
- the minimum PHP, Laravel or Node.js version goes up

## Keeping the changelog

[CHANGELOG.md](/reference/changelog/) has an "Unreleased" section at the top. Every pull request that changes what a user sees adds a line there, in the same pull request as the change.

Group lines under these headings, and leave out the ones you do not need:

| Heading | For |
|---|---|
| Added | New features |
| Changed | Changes to existing behaviour |
| Deprecated | Features that will be removed later |
| Removed | Features taken out |
| Fixed | Bug fixes |
| Security | Fixes for vulnerabilities |

Write each line for someone using Nevela, not for someone reading the code. Say what they can now do or what changed for them:

```md
### Added

- `nevela:seed --fresh` deletes existing records before seeding.

### Fixed

- A failed seed no longer leaves the table empty when `--fresh` was used.
```

Refactors, test changes and CI changes that users cannot notice do not need a line.

## Cutting a release

Start on `main` with everything merged and CI green.

**1. Preview it.**

```sh
pnpm release minor --dry-run
```

This prints the new version and the notes that will go under it, and writes nothing. Use `patch`, `minor`, `major`, or an exact version such as `0.2.0`.

**2. Run it.**

```sh
pnpm release minor
```

It moves the Unreleased notes under a new heading with today's date, leaves Unreleased empty, updates the links at the bottom of the changelog, and writes the version to the three files above.

It stops without changing anything if:

- Unreleased is empty. Write the notes first.
- the three version files disagree
- the version is lower than the current one, or is already in the changelog

**3. Review, commit, tag and push.** The script only edits files and prints these commands for you:

```sh
git add CHANGELOG.md package.json apps/web/package.json packages/laravel/src/Nevela.php
git commit -m "Release v0.2.0"
git tag v0.2.0
git push origin main --follow-tags
```

**4. Update the docs site's headline.** `apps/docs/src/version.ts` holds the one-line summary shown in the banner and on the home page. The version number beside it is read from `package.json`, so only the words need changing.

**5. The GitHub release is created for you.** Pushing the tag runs `.github/workflows/release.yml`. It checks that the tag matches the version in `package.json`, takes that version's section from the changelog, and publishes it as the release notes.

## The first release

No version has been tagged yet. The files already say `0.1.0`, so the first release keeps that number:

```sh
pnpm release 0.1.0
```

## If something goes wrong

**The release script made changes you do not want.** Nothing is committed yet. Discard them:

```sh
git checkout -- CHANGELOG.md package.json apps/web/package.json packages/laravel/src/Nevela.php
```

**You tagged the wrong commit, and have not pushed.** Delete the tag and make it again:

```sh
git tag -d v0.2.0
```

**A bad release is already public.** Do not move or delete the tag: anyone who fetched it would have a different `v0.2.0` from everyone else. Fix the problem and release `v0.2.1`.

## Not set up yet

The Laravel package is not published on Packagist. Packagist expects a package at the root of a repository, and `nevela/laravel` lives in `packages/laravel`. Publishing it needs a read-only copy of that folder in its own repository, updated on each tag. Until then, apps install it by path, as [Getting started](/start/quickstart/#starting-from-an-empty-laravel-app) shows.
