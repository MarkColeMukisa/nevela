---
title: "Working on Nevela"
description: "Clone the repository, run its apps, and test a change to the framework itself."
---

This page is for changing Nevela itself. To build an app with Nevela, use the [quickstart](/start/quickstart/) instead.

## The repository

```
nevela/
├─ apps/
│  ├─ api/     a Laravel app used to develop and test the package
│  ├─ web/     the dashboard. Also the template new apps are created from
│  └─ docs/    this documentation site
├─ packages/
│  ├─ laravel/         the nevela/laravel Composer package
│  └─ create-nevela/   the `pnpm create nevela` command
├─ scripts/    the release and split scripts
└─ CHANGELOG.md
```

## Set up

```sh
git clone https://github.com/MarkColeMukisa/nevela.git
cd nevela
pnpm install
```

The Laravel app:

```sh
cd apps/api
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
php artisan nevela:user
php artisan serve
```

The dashboard, in a second terminal:

```sh
cd apps/web
cp .env.example .env.local
pnpm dev
```

`apps/api` installs the package from `packages/laravel` by path, so a change to the package is live in the app straight away.

## The package

| Path | What it holds |
|---|---|
| `src/Console/` | The artisan commands. |
| `src/Generator/` | The templates, and the writer that keeps people's code. |
| `src/Http/` | The base form request, the error format and the token endpoints. |
| `src/Support/` | Descriptors, fields, list-query parsing and seed values. Plain PHP, tested without Laravel. |

```sh
cd packages/laravel
composer install
vendor/bin/phpunit
```

## The create command

`packages/create-nevela` has no template of its own in the repository. Run from here, it copies `apps/web` and `packages/laravel` directly, leaving out the example resources. When it is packed for npm, `build-template.mjs` copies those same folders into `template/`.

So a change to `apps/web` is a change to what new apps get.

Try it against your working copy, from any folder outside the repository:

```sh
node /path/to/nevela/packages/create-nevela/index.mjs test-app --bundled-package
```

`--bundled-package` makes the new app use `packages/laravel` from your working copy. Without it, the app installs the last release from Packagist and your changes to the package are not in it.

## The update command

`nevela:update` normally downloads dashboard templates from npm. To test it against your working copy, pack the installer into a folder and point the command at it:

```sh
cd packages/create-nevela
npm pack --pack-destination /tmp/templates

cd /path/to/a/test-app/apps/api
NEVELA_TEMPLATE_DIR=/tmp/templates php artisan nevela:update --check
```

The command looks in that folder for `create-nevela-<version>.tgz` before it asks npm.

## The docs site

```sh
pnpm docs:dev
```

Pages are Markdown in `apps/docs/src/content/docs`. The sidebar is in `apps/docs/astro.config.mjs`.

## Before opening a pull request

- Add a line to `CHANGELOG.md` under "Unreleased" if a user would notice the change.
- CI runs the package tests on PHP 8.3 and 8.4, generates and seeds in `apps/api`, builds the dashboard and the docs, and creates a new app with `create-nevela` and builds it.

`packages/laravel` is also published on its own, from a read-only copy at [MarkColeMukisa/nevela-laravel](https://github.com/MarkColeMukisa/nevela-laravel). Change it here, never there.

[Releasing](/contributing/releasing/) covers versions and publishing.
