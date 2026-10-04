---
title: "Updating"
description: "Bring an existing app up to the latest Nevela: the package, the generated code and the dashboard."
---

One command updates an existing app. Run it in `apps/api`:

```sh
php artisan nevela:update
```

It does three things, in order:

1. **Updates the package.** `nevela/laravel` is moved to the newest release with Composer.
2. **Regenerates.** The generated blocks in your models, requests, controllers and routes are rewritten from your descriptors. Your own code outside them is kept.
3. **Updates the dashboard.** Files in `apps/web` that you have not changed are brought up to the new version. Files you changed are left alone.

To see what it would do without changing anything:

```sh
php artisan nevela:update --check
```

## What happens to the dashboard

The dashboard is copied into your app when it is created, so that you can change it freely. That is why it needs its own update step.

Each file is compared three ways: the version your app started from, the new version, and what is in your app now.

| Your file | The new version | What happens |
|---|---|---|
| Unchanged by you | Changed | **Updated** |
| Not there, and it is new | Added | **Added** |
| Changed by you | Unchanged | Nothing. Yours stands. |
| Changed by you | Changed too | **Kept yours**, and listed so you can look |
| Deleted by you | Anything | Stays deleted |
| Unchanged by you | Removed | Left in place, and listed |

```
  lib/csv.ts ................................................ updated
  lib/new-thing.ts ............................................ added
  lib/utils.ts ......... kept yours — changed in the template too
  package.json: sonner ............................. ^2.0.8 → ^2.0.9
```

Nothing of yours is overwritten. For a file listed as "kept yours", open the new version on GitHub from the link the command prints, and bring across what you want.

Your resources are not part of this. Their descriptors and pages are generated from Laravel and are handled by step 2.

### package.json

`apps/web/package.json` is merged, not replaced. A dependency moves to the new version when you still have the version the dashboard came with. One you changed yourself is kept and reported. Your app's name and your own dependencies are not touched.

When dependencies change, the command tells you to install them:

```sh
cd ../web && pnpm install
```

### How it knows what you changed

`apps/web/.nevela.json` records which dashboard version your app is on. The command downloads that version and the new one, compares, and then writes the new version into the file. Commit it with the rest of your app.

Apps created before this file existed are treated as starting from 0.1.1, which is what they all came from.

## Your first update

`nevela:update` arrived in 0.1.2. An app created with 0.1.0 or 0.1.1 does not have the command yet. Get it once with Composer, then use the command from then on:

```sh
cd apps/api
composer update nevela/laravel
php artisan nevela:update
```

### If Composer says there is nothing to update

**Apps created on Windows with 0.1.0** have the package pinned to exactly one version. Open `apps/api/composer.json`, change `"nevela/laravel": "0.1"` to `"nevela/laravel": "^0.1"`, and run `composer update nevela/laravel` again.

**Apps with a `packages/nevela-laravel` folder** install the package from that folder, so Composer has nowhere to update it from. Move the app to Packagist once:

1. In `apps/api/composer.json`, remove the `nevela` entry under `repositories`.
2. Run `composer require nevela/laravel`.
3. Delete the `packages/nevela-laravel` folder.

## Getting the newest installer

Updating an app and creating a new one are separate things. `pnpm create nevela my-app` always creates a new app, with whichever version of the installer your package manager gives it.

That is not always the newest. pnpm holds back versions published in the last day as a safety measure, and both pnpm and npm cache. The installer tells you when a newer one exists and what to run. To ask for a version by number:

```sh
pnpm create nevela@0.1.2 my-app
```

## Options

| Option | Meaning |
|---|---|
| `--check` | Show what would change, and change nothing. |
| `--skip-package` | Leave `nevela/laravel` as it is. Regenerate and update the dashboard only. |
