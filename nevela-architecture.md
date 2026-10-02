# Nevela architecture

## Benchmarks and what we take from each

| Source | What Nevela takes |
|---|---|
| **Laravel** | The runtime authority: Eloquent, migrations, FormRequest validation, policies, Sanctum, queues, mail, scheduling. |
| **Flare** (JB) | The whole Next.js frontend: dashboard, resource tables/forms, auth screens, themes, plus the `defineResource` descriptor format and the REST contract. Also the "generated block" regeneration model. |
| **Grit** | The workflow promise: one command generates a resource across backend, types and admin UI, in a monorepo. |
| **Next.js** | The UI runtime (Flare's `next` stack: Next 16, React 19, server components and server actions). |

## Decisions (2026-10-02)

1. **Next.js layer comes from Flare's frontend** (`examples/next-shop` / CLI `next` template). Nevela does not fork JB's components; it replaces only the data and auth seam.
2. **The generator is a Laravel package** (`php artisan nevela:resource`). A thin Node scaffolder (`nevela new`) comes later.
3. **Auth is Sanctum personal access tokens (Bearer).** Next.js server code holds the token in an httpOnly cookie; the browser never sees it.
4. **Monorepo**: `apps/api` (Laravel) + `apps/web` (Next.js) + `packages/*`.
5. **Single source of input**: `apps/api/nevela/resources/*.json`. Laravel code generated from it is the runtime authority. The Flare `.resource.ts` is derived for rendering only. No validation logic is duplicated in TypeScript.

## Where Flare's Next.js app touches data (the seam)

Reading `examples/next-shop`, the dashboard pages and components read the database directly rather than calling the REST API (only the relation and file fields `fetch`). The core of that is:

- `lib/dashboard.ts`: `dashboardStore(name)` (a `ResourceStore` over Prisma), `dashboardSession()` (Better Auth), `resourceStats()` (raw SQL), `policyFor()`
- `app/dashboard/actions.ts` / `import-actions.ts`: server actions calling the store
- `lib/auth*.ts`, `app/api/auth/[...all]`: Better Auth
- `resources/server.ts`: the resource → Prisma delegate registry

Everything above that layer (pages, `ResourceTable`, forms, fields, themes) is driven by the `.resource.ts` descriptors. About 20 files outside `app/api` import Prisma or Better Auth in total: besides the ones above, `lib/api.ts`, `audit.ts`, `search.ts`, `views.ts`, `session.ts`, the dashboard layout and home page, the account pages, sign-in/sign-up, `resource-chart.tsx` and `proxy.ts`.

**Slice 2 (built, `apps/web`)** replaces that layer with Laravel-backed versions:

- `lib/laravel.ts`: the only `fetch` to Laravel, with the Bearer token from an httpOnly cookie
- `lib/resource/store.ts`: `laravelStore(resource)`, the same `ResourceStore` methods (`list/get/titles/create/update/replace/delete`, returning `{ ok, data } | { ok: false, status, error, issues }`)
- `lib/dashboard.ts`: `dashboardSession()` → `GET /api/auth/me`, `resourceStats()` → `GET /api/{slug}/_stats`
- `app/auth-actions.ts`: sign-in → `POST /api/auth/token`, sign-out → `DELETE /api/auth/token`
- Prisma, Better Auth and the `app/api/*` routes are gone from the web app

Removed with them, until Laravel has endpoints for each: sign-up, password reset, two-factor, passkeys, account pages, saved views, audit history, the per-day chart, search, costs and observability.

## The REST contract (what Laravel serves)

Matches Flare's `createResourceClient` and `ResourceStore`, so Flare's own client works against Laravel unchanged.

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

Records use camelCase keys, string UUID `id`, ISO `createdAt`/`updatedAt`, and `Y-m-d` dates.

Errors (only under the Nevela prefix):

- `422 { error, issues: [{ path, message }] }`: Laravel validation messages, keyed by field
- `400 { error, issues: [{ param, message }] }`: bad list query (unknown sort/filter field, bad page)
- `409 { error, field }`: unique conflict that slipped past validation (a race). Normally the `unique` rule catches it first and answers 422 with the field as `path`
- `401` / `403` / `404` / `405` / `429 { error }`

## Package map (`packages/laravel`)

- `Support/`: `Descriptor`, `Field`, `ListQuery`, `Naming`. Pure PHP, unit-tested without Laravel.
- `Generator/`: `ResourceGenerator` (templates) and `Writer` (generated-block merge, hash-based edit detection, CRLF-safe).
- `Http/`: `ResourceRequest` (camelCase → columns, PATCH/PUT semantics, unknown-key rejection), `FlareErrors`, `TokenController`.
- `Nevela.php`: `list()` and `stats()` used by generated controllers.
- `Console/`: `nevela:resource`, `nevela:generate`. Both also write the web app's descriptor, registry (`resources/index.ts`) and dashboard pages when `nevela.web_path` exists.

## Verified so far

- 16 unit tests pass: descriptor parsing and JSON round-trip, list-query parsing and rejection, generated-block writer (update, edit detection, once-files, CRLF), and generator output (`php -l` on every generated PHP file, rules, the web registry and dashboard pages, regeneration that keeps user code).
- The package runs in a real Laravel 13 app (`apps/api`, PHP 8.5, SQLite). Every endpoint in the contract was called over HTTP: token, me, list with sort/search/filter/paging, show, create, PATCH, PUT, delete, stats, descriptors, and the 400/401/404/422 error bodies.
- `apps/web` type-checks against `@flaredev/core` 0.9.1 (including the generated `product.resource.ts`) and `next build` passes.
- With both apps running: the dashboard home, list, filtered list, detail and not-found pages render Laravel's data, and the sign-in, create, update, import, export, delete and bulk-delete server actions were called over HTTP and returned Laravel's results and validation messages.
- **Not yet done:** clicking through the UI in a browser. The forms, dialogs and toasts are Flare's unchanged client components, but nobody has watched them work against Laravel.

## Roadmap

1. **Auth beyond sign-in.** Sign-up, password reset and an account page, backed by Laravel. Roles on the user, and policies generated from a descriptor `policy` block.
2. **Contract test.** Run the web app's store against `php artisan serve` in CI. Bring back saved views, audit history and the per-day chart with Laravel endpoints.
3. **Relations** (`belongsTo`, `hasMany`) → foreign keys, `exists:` rules, the Flare relation field and an options endpoint.
4. **Files** → Laravel filesystem (S3/R2) + Flare's file field.
5. **`nevela new`**: scaffold the monorepo (Laravel app + Flare web overlay) in one command. **`nevela dev`**: run both apps together.
6. **Ship**: Laravel Cloud for `apps/api`, Vercel for `apps/web`, with preview environments.
