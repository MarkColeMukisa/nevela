---
title: "Updating and upgrading"
description: "Update the nevela command, and upgrade an existing app to the latest Nevela without losing anything you changed."
---

Two things get newer, and each has its own command. If you have used Grit, these are the same two.

| Command | What it brings up to date | Where you run it |
|---|---|---|
| `nevela update` | the `nevela` command on your computer | anywhere |
| `nevela upgrade` | the app you are in: its Nevela package and its dashboard | inside the app |

```sh
nevela update        # anywhere
cd my-app
nevela upgrade       # inside the app
```

## The nevela command

Install it once, and every command is this short, in every shell:

```sh
npm install -g create-nevela
```

| | |
|---|---|
| `nevela new my-app` | create an app |
| `nevela dev` | run the API and the dashboard |
| `nevela resource Product --fields="name:string, price:money" --seed` | add a resource |
| `nevela upgrade` | bring the app to the latest Nevela |
| `nevela update` | update the command itself |

`nevela update` asks the package manager that installed the command (npm, pnpm, yarn or bun) for the latest version. It does not touch any app.

You do not have to update the command before upgrading an app. `nevela upgrade` fetches the newest version of itself for that one run, so an app is always upgraded by the latest code, whatever is installed.

## Upgrading an app

From anywhere inside the app:

```sh
nevela upgrade
```

It does three things, in order:

1. **Updates the package.** `nevela/laravel` is moved to the newest release with Composer. If the app's `composer.json` asks for a range that stops short of it (`^0.2` when 0.3.0 is out), the range is moved too, and the command says so.
2. **Regenerates.** The generated blocks in your models, requests, controllers and routes are rewritten from your descriptors. Your own code outside them is kept.
3. **Upgrades the dashboard.** Files in `apps/web` that you have not changed are brought up to the new version. Files you changed are left alone.

It ends by telling you if the new version has migrations to run (`nevela migrate`) or dashboard packages to install.

To see what it would do without changing anything:

```sh
nevela upgrade --check
```

### Without the nevela command

The same thing, if you have not installed the command:

```sh
php nevela upgrade             # the app's own launcher
pnpm nevela upgrade            # through your package manager; works in every shell
npx create-nevela upgrade      # nothing to install, and works on an app of any age
```

In Git Bash on Windows with Laravel Herd, typing `php` gives "command not found", because Herd provides PHP as `php.bat`. Use one of the other two there, or the `nevela` command.

An app created before 0.3.0 calls this `update`: `php nevela update`. That name still works inside an app. For an app that old, prefer `nevela upgrade` or `npx create-nevela upgrade`: they run the newest code, which repairs what would stop an older app from upgrading (see below).

## Your changes are kept

The dashboard is copied into your app when it is created, so that you can change it freely. Nevela keeps a record of it so that an upgrade never overwrites that work.

### The record

`apps/web/.nevela.json` holds the dashboard version your app is on and a fingerprint of every file in that version. Comparing your files against the fingerprints tells Nevela exactly which ones you have changed. Commit this file.

To see what you have changed at any time:

```sh
php nevela status -v
```

```
  Dashboard ................................................ template 0.1.4
  Your dashboard changes ................. 2 file(s), kept on every update
    changed lib/number.ts
    changed lib/utils.ts
```

### What an update does with each file

| Your file | The new version | What happens |
|---|---|---|
| Unchanged by you | Changed | **Updated**. The old file is backed up first. |
| Not there, and it is new | Added | **Added** |
| Changed by you | Unchanged | Nothing. Yours stands. |
| Changed by you | Changed too | **Yours is kept.** The new version is saved beside it for you to compare. |
| Deleted by you | Anything | Stays deleted |
| Unchanged by you | Removed | Left in place, and listed |

```
  lib/csv.ts ................................................... updated
  lib/new-thing.ts ............................................... added
  lib/utils.ts ............ kept yours — changed in the template too
  package.json: sonner ................................ ^2.0.8 → ^2.0.9
  package.json: clsx ............ kept yours, 2.1.1 (template: ^2.1.2)
```

Your resources are not part of this. Their descriptors and pages are generated from Laravel and are handled by step 2.

### Backups, and undo

Before an update replaces a file, it copies the old one to `apps/web/.nevela/backups/<date>-<from>-to-<to>/`. If an update turns out to be wrong for you, put everything back:

```sh
nevela upgrade --undo
```

That restores every file the last update replaced, removes the files it added (unless you have changed them since), and puts the record back, so the update can be applied again later. It does not change the Composer package; the command prints how to go back a version there if you need to.

### When you and the update both changed a file

Your version stays where it is. The new version is saved to `apps/web/.nevela/incoming/<version>/`, at the same path, so you can compare the two in your editor and bring across what you want.

### package.json

`apps/web/package.json` is merged, not replaced. A dependency moves to the new version when you still have the version the dashboard came with. One you changed yourself is kept and reported. Your app's name and your own dependencies are not touched.

When dependencies change, the command tells you to install them.

### History

Every update is added to the `history` in `.nevela.json`: the date, the versions, and which files were updated, added and kept. `php nevela status` shows the latest.

The `.nevela/` folder (backups and incoming files) ignores itself, so none of it goes into git.

## Older apps

**An app from before the record existed** (created with 0.1.3 or earlier) has no fingerprints yet. On its first update, Nevela downloads the dashboard version the app started from and compares against that instead, then writes the record. From then on it works as described above.

**An app pinned to one exact version.** Apps created on Windows with 0.1.0 have `"nevela/laravel": "0.1"` in `apps/api/composer.json`, which stops Composer from updating. `npx create-nevela upgrade` fixes it. By hand, change it to `"^0.1"`.

**An app with a `packages/nevela-laravel` folder** installs the package from that folder, because it was created before the package was on Packagist. `npx create-nevela upgrade` moves it to Packagist. Afterwards you can delete the folder.

## Where the new dashboard comes from

The update downloads the dashboard for the version it is moving to. It tries npm first, then the release tag on GitHub, so it works straight after a release even before the npm package is published.

## Creating apps is separate

`pnpm create nevela my-app` always creates a new app. It fetches the newest installer itself before doing anything, so it is current even when your package manager hands it an older one.

## Options

| Option | Meaning |
|---|---|
| `--check` | Show what would change, and change nothing. |
| `--undo` | Put the dashboard back as it was before the last update. |
| `--skip-package` | Leave `nevela/laravel` as it is. Regenerate and update the dashboard only. |
