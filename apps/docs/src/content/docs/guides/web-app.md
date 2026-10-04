---
title: "The web app"
description: "How the dashboard talks to Laravel, and what you can change in it."
---

`apps/web` is the dashboard. It is Flare's Next.js app with its database and sign-in code replaced by calls to Laravel. It has no database of its own.

## How a request flows

1. The browser asks the Next.js server for a page or submits a form.
2. The Next.js server reads the visitor's token from an httpOnly cookie.
3. It calls Laravel with that token as a Bearer header.
4. Laravel validates, checks its policy, reads or writes, and answers.
5. The Next.js server renders the result.

The browser never calls Laravel and never sees the token. That is why Laravel needs no CORS setup for the dashboard.

## The files that talk to Laravel

| File | What it does |
|---|---|
| `lib/laravel.ts` | The only `fetch` to Laravel. Adds the token. Every other file goes through it. |
| `app/auth-actions.ts` | Sign in and sign out. Sets and clears the token cookie. |
| `lib/session.ts` | Who is signed in, from `GET /auth/me`. |
| `lib/resource/store.ts` | List, read, create, update and delete for one resource. |
| `lib/dashboard.ts` | What the dashboard components import: the store per resource, stats and permissions. |
| `proxy.ts` | Sends visitors with no token cookie to `/sign-in` before a page renders. |

Everything else (tables, forms, fields, themes) is Flare's and reads only the resource descriptors.

## Files Laravel generates here

Running `nevela:resource` or `nevela:generate` in `apps/api` writes into this app:

| File | Notes |
|---|---|
| `resources/<name>.resource.ts` | The dashboard's description of the resource. Regenerated between the markers. |
| `resources/index.ts` | The list of all resources. The sidebar and dashboard home are built from it. |
| `app/dashboard/<slug>/page.tsx` and the `new`, `[id]` and `[id]/edit` pages | Written once. Change them freely. |

Do not edit fields in the `.resource.ts` file. Change the JSON descriptor in the Laravel app and regenerate, so both sides stay the same.

## Getting dashboard fixes later

The dashboard's files are yours to change. `php artisan nevela:update` brings the ones you have not changed up to a newer version, and leaves the ones you changed alone. See [Updating](/guides/updating/).

## Changing how a resource looks

Display options go in the `.resource.ts` file, *below* the generated block:

```ts
export default defineResource({
  // nevela:generated:start hash=…
  name: "Product",
  fields: { /* … */ },
  // nevela:generated:end
  defaultSort: { field: "name", direction: "asc" },
  perPage: 50,
});
```

To change a page's layout, edit the page under `app/dashboard/<slug>/`. For example, remove `<ResourceStats />` from `page.tsx` to drop the numbers above the table.

## The app's name and theme

`lib/site.ts` holds the name, tagline and the text on the sign-in and home pages. Its `theme` picks the look: `default`, `coral`, `amber`, `sky`, `mono` or `emerald`.

## What was removed from Flare's app

These parts depended on Flare's own database or its auth library, and Laravel has no endpoints for them yet: sign-up, password reset, two-factor sign-in, passkeys, account pages, saved table views, the change history on a record, the records-per-day chart, product search, and the costs and observability pages.

File and relation fields are still in the code but Nevela does not generate them.
