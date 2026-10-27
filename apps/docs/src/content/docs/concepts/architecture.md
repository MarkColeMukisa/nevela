---
title: "How Nevela is built"
description: "Why Nevela is built this way, how it is tested, and the roadmap."
---

## Benchmarks and what we take from each

| Source | What Nevela takes |
|---|---|
| **Laravel** | The runtime authority: Eloquent, migrations, FormRequest validation, policies, Sanctum, queues, mail, scheduling. |
| **Flare** (JB) | The whole Next.js frontend: dashboard, resource tables/forms, auth screens, themes, plus the `defineResource` descriptor format and the REST contract. Also the "generated block" regeneration model. |
| **Grit** | The workflow promise: one command generates a resource across backend, types and admin UI, in a monorepo. |
| **Next.js** | The UI runtime (Flare's `next` stack: Next 16, React 19, server components and server actions). |

## Decisions (2026-10-02)

1. **Next.js layer comes from Flare's frontend** (`examples/next-shop` / CLI `next` template). Nevela does not fork JB's components; it replaces only the data and auth seam.
2. **The generator is a Laravel package.** `nevela resource` is `php artisan nevela:resource` underneath, and the `nevela` command is a thin Node program. It creates apps and updates itself; inside an app it hands each command to artisan, running Composer first for `nevela upgrade`.
3. **Auth is Sanctum personal access tokens (Bearer).** Next.js server code holds the token in an httpOnly cookie; the browser never sees it.
4. **Monorepo**: `apps/api` (Laravel) + `apps/web` (Next.js) + `apps/docs` (this site) + `packages/*`.
5. **Single source of input**: `apps/api/nevela/resources/*.json`. Laravel code generated from it is the runtime authority. The Flare `.resource.ts` is derived for rendering only. No validation logic is duplicated in TypeScript.

## How the dashboard was taken from Flare

This is how the web app came to be, kept for whoever wonders why it is shaped as it is.

Reading `examples/next-shop`, Flare's dashboard pages and components read the database directly rather than calling a REST API. The core of that was:

- `lib/dashboard.ts`: `dashboardStore(name)` (a `ResourceStore` over Prisma), `dashboardSession()` (Better Auth), `resourceStats()` (raw SQL), `policyFor()`
- `app/dashboard/actions.ts` / `import-actions.ts`: server actions calling the store
- `lib/auth*.ts`, `app/api/auth/[...all]`: Better Auth
- `resources/server.ts`: the resource → Prisma delegate registry

Everything above that layer (pages, `ResourceTable`, forms, fields, themes) is driven by the `.resource.ts` descriptors, so Nevela replaced only the layer:

- `lib/laravel.ts`: the only `fetch` to Laravel, with the Bearer token from an httpOnly cookie
- `lib/resource/store.ts`: `laravelStore(resource)`, the same `ResourceStore` methods (`list/get/titles/create/update/replace/delete`, returning `{ ok, data } | { ok: false, status, error, issues }`)
- `lib/dashboard.ts`: `dashboardSession()` → `GET /api/auth/me`, `resourceStats()` → `GET /api/{slug}/_stats`
- `app/auth-actions.ts`: sign-in → `POST /api/auth/token`, sign-out → `DELETE /api/auth/token`
- Prisma, Better Auth and their `app/api/*` routes are gone from the web app

What depended on Flare's database went with it. Most has come back with a Laravel endpoint behind it: sign-up, password reset, two-factor, passkeys, Google and GitHub, the account pages, the per-day chart (as [insights](/reference/api/#insights)) and the change history (as [the activity log](/guides/notifications/#the-activity-log)). Saved table views, product search, and the costs and observability pages have not.

## The REST contract (what Laravel serves)

It matches Flare's `createResourceClient` and `ResourceStore`, so Flare's own client works against Laravel unchanged. The core is below; the [REST API](/reference/api/) reference has all of it, including the trash, bulk create, insights, actions, files and sign-in.

| Request | Response |
|---|---|
| `GET /api/{slug}?page&perPage&sort=-field&q&filter[field]=v` | `200 { data: Record[], meta: { page, perPage, total, totalPages } }` |
| `GET /api/{slug}/{id}` | `200 Record` (unwrapped) |
| `POST /api/{slug}` | `201 Record` + `Location` |
| `PATCH /api/{slug}/{id}` | `200 Record`: partial; only the sent fields are validated |
| `PUT /api/{slug}/{id}` | `200 Record`: replace; optional fields left out are cleared |
| `DELETE /api/{slug}/{id}` | `204` |
| `GET /api/{slug}/_stats?field=status&days=7` | `200 { total, current, previous, values }` |
| `POST /api/auth/token` · `GET /api/auth/me` · `DELETE /api/auth/token` | `{ token, user }` · `{ user }` · `204` |
| `GET /api/_nevela/resources` | `{ data: Descriptor[] }` |

Records use camelCase keys, a string `id` (a UUID, or digits where ids are integers), ISO `createdAt`/`updatedAt`, and `Y-m-d` dates.

Errors (only under the Nevela prefix):

- `422 { error, issues: [{ path, message }] }`: Laravel validation messages, keyed by field
- `400 { error, issues: [{ param, message }] }`: bad list query (unknown sort/filter field, bad page)
- `409 { error, field }`: unique conflict that slipped past validation (a race). Normally the `unique` rule catches it first and answers 422 with the field as `path`
- `401` / `403` / `404` / `405` / `429 { error }`

## Package map (`packages/laravel/src`)

| Folder | What it holds |
|---|---|
| `Support/` | `Descriptor`, `Field`, `ListQuery`, `Naming`, the fake values seeding uses. Plain PHP, unit-tested without Laravel. |
| `Generator/` | `ResourceGenerator` (the templates), `BlogPages`, and `Writer` (the generated-block merge, hash-based edit detection, CRLF-safe). |
| `Console/` | Every `nevela:*` artisan command. See [Commands](/reference/commands/). |
| `Http/` | `ResourceRequest` (camelCase → columns, PATCH/PUT semantics, unknown-key rejection), `FlareErrors`, and the controllers for sign-in (`Auth/`), users and roles (`Access/`), uploads, actions, the trash, public forms, notifications and activity. |
| `Auth/` | Accounts, sign-in sessions, passkeys, one-time codes, two-factor and Google and GitHub. |
| `Access/` | Roles and permissions, closed accounts and the sample users. |
| `Media/` | File types, upload checks and the image optimiser with its profiles. |
| `Trash/`, `Concerns/` | The trash, and the traits a generated model uses: `Trashable`, `Confirmable`, `OptionLabels`. |
| `Forms/` | Public forms: the bot checks, proving an address, and the mail a form causes. |
| `Notices/`, `Activity/` | The notification bell and the activity log. |
| `Models/`, `Rules/` | Nevela's own tables (roles, passkeys, two-factor, uploads) and validation rules. |
| `Nevela.php` | `list()`, `stats()` and the other helpers generated controllers call, and `Nevela::VERSION`. |

## How it is tested

Every pull request runs all of this in CI, and a release is cut only when it is green:

- **The package's unit tests**, on PHP 8.3 and 8.4: descriptor parsing, list queries, the generated-block writer, the generator's output (`php -l` on every generated PHP file), image optimisation, and more.
- **The Laravel app's feature tests**, on SQLite and again on Postgres: sign-in in every form, roles, the trash, public forms, the activity log, notifications and the rest, over HTTP.
- **The generated code is up to date:** the app's resources are regenerated, and CI fails if that changes a file. Then a thousand products are seeded, and the images checked for their renditions.
- **A new app, end to end:** `create-nevela` is packed as it would be published, creates an app, and in it every kind of resource is made with `php nevela` (relations, rich text, private files, public forms, actions, an adopted table), migrated, seeded and checked. Then the dashboard is type-checked and built.
- **The dashboard and the docs** are type-checked and built, and the release script, the installer and the dashboard's API checks have unit tests.

Before each release an app made with the previous version from npm is upgraded to the new one, and checked: the files changed by hand are kept, the migrations run, and the dashboard builds. Changes to the dashboard are clicked through in a browser.

## Roadmap

1. **Tutorials.** Three apps built from scratch, simple to hard: contacts, an online shop with orders, and a student app. Each with its finished code in the repository, built by CI.
2. **Many-to-many relations**, generated rather than made by hand as a link resource.
3. **Files.** Deleting a public file along with its record, and uploads sent straight to S3 or R2.
4. **Saved table views** and search across resources, with Laravel endpoints.
5. **A contract test:** the web app's store run against `php artisan serve` in CI.
