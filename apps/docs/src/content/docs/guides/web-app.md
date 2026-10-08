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

## Three ways to add records

Every resource's list has them side by side, for anyone allowed to create:

| | For |
|---|---|
| **New** | One record, in the form. |
| **Add several** | The dozen you have in your head or on a piece of paper. A grid that opens with five blank rows; add more as you go. |
| **Import CSV** | A file somebody already has. |

In the grid, rows you leave empty are ignored, and the button says how many will be created ("Create 3 products"). The rows are saved together or not at all: if one is wrong, nothing is created and the mistake is shown on its row.

A field that doesn't fit in a cell, an image or a file, has no column. If one of those is required the grid says so, and those records are for the form.

## Insights

Above every resource's table there is an **Insights** panel, closed until you open it:

- **Created per day, week or month**, as a bar chart: the last 30 days, 26 weeks or 12 months.
- **How the records split** across each field that is a choice, an enum or a yes/no: a bar for every choice, with its count and its share.

The charts are of the rows the table is showing. Search, or filter the list to one category, and they redraw for that.

Nothing is counted until the panel is opened, so a list costs what it did before. Whether you left it open is remembered, for each resource, in your browser.

A resource gets this without being asked: the choices come from its descriptor. There is nothing to configure.

## Getting dashboard fixes later

The dashboard's files are yours to change. `nevela upgrade` brings the ones you have not changed up to a newer version, and leaves the ones you changed alone. See [Upgrading an app](/guides/updating/#upgrading-an-app).

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

These parts depended on Flare's own database, and Laravel has no endpoints for them yet: saved table views, the change history on a record, the records-per-day chart, product search, and the costs and observability pages. Signing in with Google, GitHub and other providers is not there either.

Sign-up, password reset, two-factor, passkeys and the account pages are Flare's screens, backed by Laravel. See [Authentication](/guides/authentication/).

## Talking to Laravel from the browser

Almost everything goes through server actions, which run on the web app's server and call Laravel with the person's token. Three things are done by the browser itself, through the web app's own `/api/…` route (`app/api/[...path]/route.ts`), which adds the token and passes the request on:

- the relation picker's search, `GET /api/categories?q=…`,
- showing stored files, `GET /api/_nevela/files/<key>`, and
- uploading one, `PUT /api/_nevela/uploads/<Resource>/<field>`.

Nothing else that changes data is let through that route. The token stays in its httpOnly cookie either way.

`lib/files.ts` has `fileUrl(key, "thumb")`, which gives the address of a stored file or one of its renditions.
