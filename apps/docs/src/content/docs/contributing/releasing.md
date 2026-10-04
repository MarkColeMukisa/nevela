---
title: "Releasing"
description: "How versions are numbered, how the changelog is kept, and how to cut a release."
---

How Nevela is versioned, how the changelog is kept, and how to cut a release.

## One version for the whole repository

The Laravel package, the web app, the create command and the docs are released together under one number. It is recorded in four places, and `pnpm release` keeps them the same:

| File | Where |
|---|---|
| `package.json` | `"version"` |
| `apps/web/package.json` | `"version"` |
| `packages/create-nevela/package.json` | `"version"` |
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
- the version files disagree
- the version is lower than the current one, or is already in the changelog

**3. Review, commit, tag and push.** The script only edits files and prints these commands for you:

```sh
git add CHANGELOG.md package.json apps/web/package.json packages/create-nevela/package.json packages/laravel/src/Nevela.php
git commit -m "Release v0.2.0"
git tag -a v0.2.0 -m "v0.2.0"
git push origin main --follow-tags
```

The `-a` matters: `--follow-tags` only pushes annotated tags, so a plain `git tag v0.2.0` would stay on your machine.

**4. Publish the packages.** `pnpm split:laravel v0.2.0` for Packagist and `npm publish` in `packages/create-nevela` for npm. Both are described below.

**5. Update the docs site's headline.** `apps/docs/src/version.ts` holds the one-line summary shown in the banner and on the home page. The version number beside it is read from `package.json`, so only the words need changing.

**6. The GitHub release is created for you.** Pushing the tag runs `.github/workflows/release.yml`. It checks that the tag matches the version in `package.json`, takes that version's section from the changelog, and publishes it as the release notes.

## The first release

No version has been tagged yet. The files already say `0.1.0`, so the first release keeps that number:

```sh
pnpm release 0.1.0
```

## If something goes wrong

**The release script made changes you do not want.** Nothing is committed yet. Discard them:

```sh
git checkout -- CHANGELOG.md package.json apps/web/package.json packages/create-nevela/package.json packages/laravel/src/Nevela.php
```

**You tagged the wrong commit, and have not pushed.** Delete the tag and make it again:

```sh
git tag -d v0.2.0
```

**A bad release is already public.** Do not move or delete the tag: anyone who fetched it would have a different `v0.2.0` from everyone else. Fix the problem and release `v0.2.1`.

## Publishing the create command to npm

`create-nevela` is what makes `pnpm create nevela my-app` work. Publish it after tagging a release:

```sh
cd packages/create-nevela
npm login          # once per machine
npm publish
```

`npm publish` runs `build-template.mjs` first, which copies the dashboard (`apps/web`) and the Laravel package (`packages/laravel`) into the package, leaving out the example resources. To see exactly what would be published without publishing:

```sh
npm pack --dry-run
```

Its version is the repository's version, so publish once per release. An installer already on someone's machine fetches the newest one from npm before it runs, so a published fix reaches people at once.

`php nevela update` gets dashboards from npm when it can and from the release tag on GitHub otherwise, so it works in the gap between tagging and publishing.

## Publishing the Laravel package to Packagist

Packagist expects a package at the root of a repository, and `nevela/laravel` lives in `packages/laravel`. So it is published from [MarkColeMukisa/nevela-laravel](https://github.com/MarkColeMukisa/nevela-laravel), a read-only copy of that folder with its history. Nobody commits there; it is only ever written by the split.

### On every release

After the tag is pushed:

```sh
pnpm split:laravel v0.2.0
```

That copies `packages/laravel` as it is on `main` to the other repository, and gives the same tag there. Packagist reads versions from those tags and picks a new one up within a few minutes.

Without a tag, `pnpm split:laravel` updates the copy's `main` only. It uses your own git credentials, and nothing is stored.

### Once: submit it to Packagist

1. Sign in at [packagist.org](https://packagist.org) with GitHub.
2. Go to [packagist.org/packages/submit](https://packagist.org/packages/submit) and enter `https://github.com/MarkColeMukisa/nevela-laravel`.
3. Let Packagist install its GitHub hook when it offers, so new tags show up without a manual update.

This is done: the package is at [packagist.org/packages/nevela/laravel](https://packagist.org/packages/nevela/laravel). A version appears there for each release tag in the copy.

### What changes for new apps

`create-nevela` asks Packagist whether there is a release that goes with its own version: `^0.1` accepts any `0.1.x`. If there is, the new app installs `nevela/laravel` from Packagist. If not, it puts the copy that ships inside the installer in the app's `packages/nevela-laravel` folder and installs it from there. The command people type is the same either way.

So release order matters: split and tag the package before publishing `create-nevela` to npm, or the new installer will find no matching release and fall back to its bundled copy.

### Optional: let CI do the split

`.github/workflows/split-laravel.yml` runs the same split on every push to `main` and every release tag, so nobody has to remember. It needs a token, because a workflow in one repository cannot push to another by default:

1. Create a fine-grained personal access token with **Contents: read and write** on `nevela-laravel` only.
2. Add it to this repository as the secret `LARAVEL_SPLIT_TOKEN`: `gh secret set LARAVEL_SPLIT_TOKEN`.
3. Turn the workflow on: `gh variable set LARAVEL_SPLIT_REPO --body MarkColeMukisa/nevela-laravel`.

Until that variable is set, the workflow does nothing.
