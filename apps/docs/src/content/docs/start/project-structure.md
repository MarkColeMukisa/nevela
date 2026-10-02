---
title: "Project structure"
description: "What is in the repository, and where your own code goes."
---

Nevela is one repository with three apps and one package.

```
nevela/
├─ apps/
│  ├─ api/     the Laravel app
│  ├─ web/     the Next.js dashboard
│  └─ docs/    this documentation site
├─ packages/
│  └─ laravel/ the nevela/laravel Composer package
├─ scripts/    the release script
└─ CHANGELOG.md
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
| `components/` | Flare's tables, forms and fields. |
| `policies/` | Optional: hide buttons by role. |

See [The web app](/guides/web-app/) for how these fit together.

## packages/laravel, the package

| Path | What it holds |
|---|---|
| `src/Console/` | The three artisan commands. |
| `src/Generator/` | The templates, and the writer that keeps your code. |
| `src/Http/` | The base form request, the error format and the token endpoints. |
| `src/Support/` | Descriptors, fields, list-query parsing and seed values. Plain PHP, tested without Laravel. |
| `tests/` | The unit tests. |

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
