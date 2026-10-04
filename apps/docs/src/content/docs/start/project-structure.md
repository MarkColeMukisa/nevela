---
title: "Project structure"
description: "What is in a new Nevela app, and where your own code goes."
---

`pnpm create nevela my-app` gives you two apps in one folder.

```
my-app/
├─ apps/
│  ├─ api/      the Laravel app
│  └─ web/      the Next.js dashboard
├─ scripts/
│  └─ dev.mjs   runs both apps together
└─ package.json
```

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
| `database/migrations/` | The create-table migration per resource. Written once, then yours. |

## apps/web, the dashboard

| Path | What it holds |
|---|---|
| `resources/` | The dashboard's description of each resource, generated from Laravel. |
| `app/dashboard/<slug>/` | The list, new, detail and edit pages per resource. Written once, then yours. |
| `app/sign-in/` | The sign-in page. |
| `lib/laravel.ts` | The one place that calls Laravel. |
| `lib/site.ts` | The app's name, text and theme. |
| `components/` | The tables, forms and fields. |
| `policies/` | Optional: hide buttons by role. |
| `.env.local` | `NEVELA_API_URL`, the address of the Laravel API. |

See [The web app](/guides/web-app/) for how these fit together.

## The Nevela package

The generator, the commands and the code behind the REST API are a Composer package, `nevela/laravel`. It is installed into `apps/api/vendor` like any other dependency, and updated the same way:

```sh
cd apps/api
composer update nevela/laravel
```

If your app has a `packages/nevela-laravel` folder instead, it was created with `--bundled-package`, or before a matching release existed. Composer installs the package from that folder. Treat it as a dependency and don't edit it.

## What is not there

There is no `routes/api.php`. Nevela registers its own routes under `/api`, from `routes/nevela.php`, so the app does not need one. If you want Laravel's usual API routes file as well, run `php artisan install:api`; the two work side by side.

## The root

| File | What it does |
|---|---|
| `package.json` | `dev` runs both apps; `dev:api` and `dev:web` run one. |
| `scripts/dev.mjs` | Starts `php artisan serve` and the dashboard's dev server, and stops both together. |
| `.gitignore` | Keeps `vendor`, `node_modules`, `.env` files and build output out of git. |

## Where your code goes

| You want to | Put it |
|---|---|
| Add a relationship, scope or accessor | In the model, outside the generated block |
| Change who may do what | In the policy |
| Change the table after the first migration | In a new migration |
| Add an API endpoint | In `routes/nevela.php`, below the generated block |
| Change a dashboard page's layout | In the page under `app/dashboard/<slug>/` |
| Change a field's type or add a field | In the descriptor JSON, then run `nevela:generate` |

[Regeneration and your code](/concepts/regeneration/) explains what is and is not rewritten.
