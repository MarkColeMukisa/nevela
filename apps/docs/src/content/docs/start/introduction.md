---
title: "What is Nevela?"
description: "A Laravel-first fullstack framework. Describe a resource once and get a Laravel API and a Next.js dashboard."
---

Nevela is a Laravel-first fullstack framework. Laravel owns the data, the rules and the API. The interface is a Next.js dashboard. You describe a resource once, and Nevela generates both sides from it.

## The idea in one example

```sh
pnpm create nevela my-app
```

That gives you a Laravel API and a Next.js dashboard, set up and connected. Then, for each kind of record your app keeps:

```sh
php artisan nevela:resource Product --fields="name:string, sku:string!, price:money, kind:enum(stock|digital), notes:text?"
php artisan migrate
```

After those two commands you have:

- a `products` table, an Eloquent model, validation, a policy and a REST API at `/api/products`
- a Products section in the dashboard with a table, search, filters, forms, import and export

## Three things Nevela holds to

**Laravel is the authority.** Validation is a form request. Authorization is a policy. Both live in Laravel and nowhere else. The dashboard shows what Laravel returns, including its validation messages, so no rule is written twice.

**One description drives both sides.** A resource is a JSON file in the Laravel app. The model, the migration, the API and the dashboard screens are all generated from it, so they cannot drift apart.

**Your code is kept.** Generated code sits between markers. Regenerating rewrites only what is between them, and if you edited inside, Nevela skips the file and tells you rather than overwriting it.

## What it is made of

| Part | What it is |
|---|---|
| `create-nevela` | The command that creates a new app: `pnpm create nevela my-app`. |
| `nevela/laravel` | A Laravel package: the generator, the commands and the runtime behind the REST API. |
| The Laravel app | An ordinary Laravel app that uses the package. Your models, policies and migrations live here. |
| The web app | A Next.js dashboard. It has no database; it calls the Laravel API. |

The dashboard is [Flare](https://github.com/MUKE-coder/flare-framework)'s Next.js frontend, by Muke Johnbaptist, used under the MIT license. Nevela replaces its database and sign-in layer with calls to Laravel.

## What Nevela does not do yet

- Many-to-many relations are not generated. One-to-many is: see [Relationships](/guides/relationships/).
- Uploaded files are not deleted when their record is.
- Signing in with Google, GitHub and other providers. Passwords, passkeys, two-factor and emailed links are there: see [Authentication](/guides/authentication/).

The [roadmap](/concepts/architecture/#roadmap) lists what is planned.

## Next

- [Quickstart](/start/quickstart/): create an app and add your first resource
- [Resources](/concepts/resources/): how a resource is described and what is generated
- [Commands](/reference/commands/): the three artisan commands
