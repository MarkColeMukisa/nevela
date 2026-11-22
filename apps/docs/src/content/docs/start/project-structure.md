---
title: "Project structure"
description: "What is in a new Nevela app, and where your own code goes."
---

`nevela new my-app` gives you two apps in one folder.

```
my-app/
├─ apps/
│  ├─ api/      the Laravel app
│  └─ web/      the Next.js dashboard
├─ packages/
│  └─ shared/   what the dashboard and the phone app share: the brand, the themes, the layout
├─ nevela       the app's own launcher: php nevela does what nevela does
└─ package.json
```

`nevela new my-app --mobile` (or `--tier both`) adds a third, `apps/mobile`: [the mobile app](/guides/mobile-app/). With `--tier mobile` there is `apps/mobile` and no `apps/web`.

## packages/shared, what both apps share

Plain TypeScript, with no build step. The dashboard and the phone app both import it, so the two say the same thing and are laid out the same way. In your own code, import it as `@shared/brand` and so on. Nevela's own dashboard files use a relative path instead, so an app whose `tsconfig.json` is its own still builds.

| File | What it holds | Whose |
|---|---|---|
| `brand.ts` | The app's name and tagline. | Yours |
| `layout.ts` | The tabs that come first, after Home and before More: a shop's orders and what it sells (`"shop"`), or the resources you name, such as `["Booking", "Service"]`. | Yours |
| `themes.ts` | The phone app's colours, by theme, and the theme in use. | Yours to add to |
| `shop.ts`, `tabs.ts` | How a shop is found in your resources, and which tabs that gives. The Laravel API finds a shop by the same rule. | Nevela's |

`nevela upgrade` adds a file of these an app hasn't got, and never changes one it has. An older app's `brand.ts` starts with the name and tagline its `apps/web/lib/site.ts` had. That `site.ts` is one the installer wrote the name into, so an upgrade keeps it as it was, and it goes on naming the app itself. To make `brand.ts` the one place, set `name: brand.name` and `tagline: brand.tagline` there, importing `brand` from `../../../packages/shared/brand`.

The dashboard reaches the folder because `apps/web/next.config.ts` builds with the project as its root (`turbopack.root`). The phone app reaches it through `apps/mobile/metro.config.js`. On a host that builds one app at a time, such as Laravel Cloud with a root directory of `apps/web`, the whole repository is there while it builds, and what is imported is bundled into the build.

## apps/api, the Laravel app

An ordinary Laravel app. These are the parts Nevela adds to it:

| Path | What it holds |
|---|---|
| `nevela/resources/*.json` | One descriptor per resource. The input to everything else. |
| `app/Models/` | A model per resource. |
| `app/Http/Requests/Nevela/` | Validation per resource. |
| `app/Http/Resources/Nevela/` | The shape of a record in the API. |
| `app/Http/Controllers/Api/` | A controller per resource. |
| `app/Policies/` | Authorization per resource. Written once, then yours. |
| `routes/nevela.php` | The resource routes. Add your own below the generated block. |
| `routes/nevela-public.php` | The routes anyone may call without signing in, for resources with a [public side](/guides/public-site/). |
| `app/Nevela/Actions/<Resource>/` | A class per [action](/guides/actions/), where you write what it does. Written once, then yours. |
| `database/migrations/` | The create-table migration per resource. Written once, then yours. |

## apps/web, the dashboard

| Path | What it holds |
|---|---|
| `resources/` | The dashboard's description of each resource, generated from Laravel. |
| `app/dashboard/<slug>/` | The list, new, detail and edit pages per resource. Written once, then yours. |
| `app/dashboard/` | Also the pages every app has: the home page, your account, users and roles, the trash and the activity log. |
| `app/sign-in/`, `app/sign-up/`, … | Signing in, signing up, a forgotten password, two-factor and verifying an address. |
| `app/page.tsx`, `app/blog/` | The public site: its home page and [the blog](/guides/blog/). |
| `lib/laravel.ts` | The one place that calls Laravel. |
| `lib/site.ts` | The app's name, text and theme. |
| `components/` | The tables, forms and fields. |
| `policies/` | Optional: hide buttons by role. |
| `.env.local` | `NEVELA_API_URL`, the address of the Laravel API, and the [other settings](/guides/configuration/#web-app-envlocal). |
| `.nevela.json` | The dashboard version the app is on, a fingerprint of every file in it, and the history of updates. It is how an update knows which files you changed. Commit it. |
| `.nevela/` | Backups of files an update replaced, and new versions of files you had changed. It ignores itself in git. Appears after the first update. |

See [The web app](/guides/web-app/) for how these fit together.

## The Nevela package

The generator, the commands and the code behind the REST API are a Composer package, `nevela/laravel`. It is installed into `apps/api/vendor` like any other dependency, and updated the same way:

```sh
nevela upgrade
```

That also updates the dashboard files you have not changed. See [Updating](/guides/updating/).

If your app has a `packages/nevela-laravel` folder instead, it was created with `--bundled-package`, or before a matching release existed. Composer installs the package from that folder. Treat it as a dependency and don't edit it.

## What is not there

There is no `routes/api.php`. Nevela registers its own routes under `/api`, from `routes/nevela.php`, so the app does not need one. If you want Laravel's usual API routes file as well, run `php artisan install:api`; the two work side by side.

## The root

| File | What it does |
|---|---|
| `nevela` | The app's own launcher, for anyone without the `nevela` command installed: `php nevela resource …`, `php nevela upgrade` and the rest, without `cd apps/api`. See [Commands](/reference/commands/#the-php-nevela-launcher). |
| `package.json` | Shortcuts for people who prefer their package manager: `pnpm dev` is `nevela dev`, and `pnpm nevela <command>` is `nevela <command>`. |
| `.gitignore` | Keeps `vendor`, `node_modules`, `.env` files and build output out of git. |

## Where your code goes

| You want to | Put it |
|---|---|
| Add a scope, an accessor or a relationship of your own | In the model, outside the generated block |
| Change who may do what | In the policy |
| Change a column after it is made | In a new migration |
| Add an API endpoint | In `routes/nevela.php`, below the generated block |
| Change a dashboard page's layout | In the page under `app/dashboard/<slug>/` |
| Add a field | `nevela field Product weight:float` |
| Change a field's type | In the descriptor JSON, then run `nevela generate` |

[Regeneration and your code](/concepts/regeneration/) explains what is and is not rewritten.
