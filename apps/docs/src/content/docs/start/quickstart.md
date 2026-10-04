---
title: "Quickstart"
description: "Create a new Nevela app with one command, sign in, and add your first resource."
---

This page takes you from an empty folder to a running dashboard with one resource in it.

## What you need

- PHP 8.3 or newer, with [Composer](https://getcomposer.org/download/)
- Node.js 20 or newer
- Nothing else. The database is SQLite by default, which needs no setup.

## 1. Create the app

```sh
pnpm create nevela my-app
```

`npm create nevela@latest my-app` works too. The dashboard is installed with whichever package manager you run this with.

It asks nothing and does the setup for you:

```
  ✔ Creating the Laravel app
  ✔ Installing Nevela and token sign-in
  ✔ Setting up the database
  ✔ Installing dashboard packages (pnpm)

  ✔ Created my-app in 3m 20s

  Then open http://localhost:3000/sign-in and sign in with:

    Email      admin@example.com
    Password   password
```

Expect it to take a few minutes. Nearly all of that is Composer downloading Laravel, which depends on your connection; the dashboard's packages download at the same time.

You get this:

```
my-app/
├─ apps/api/    a Laravel app with Sanctum and Nevela installed
├─ apps/web/    the Next.js dashboard, pointed at the API
└─ scripts/     runs both together
```

[Project structure](/start/project-structure/) explains what is where.

## 2. Run it

```sh
cd my-app
pnpm run dev
```

That starts Laravel on http://127.0.0.1:8000 and the dashboard on http://localhost:3000. Open http://localhost:3000/sign-in and sign in with the starter account:

| | |
|---|---|
| Email | `admin@example.com` |
| Password | `password` |

:::caution[The starter account is for your machine]
It exists only in your local database. It is not in the code or in a migration, so it does not follow the app to a server. Still, don't keep a password everyone knows: add your own account and remove this one before anyone else can reach the app.

```sh
cd apps/api
php artisan nevela:user
```
:::

## 3. Add a resource

In `apps/api`:

```sh
php artisan nevela:resource Contact --fields="name:string, email:email!, company:string?, status:enum(lead|customer)" --icon=users
php artisan migrate
```

Reload the dashboard. Contacts is in the sidebar, with a table, a form and a detail page.

To have something to look at:

```sh
php artisan nevela:seed Contact --count=1000
```

## 4. Lock down who can do what

Every generated policy starts by allowing any signed-in user. Before real use, open `apps/api/app/Policies/ContactPolicy.php` and write your rules. The file is generated once and is yours from then on. See [Roles and policies](/guides/policies/).

## If something goes wrong

**"PHP isn't installed" or "Composer isn't installed".** The command checks for both before it starts. Install them, open a new terminal so they are on your `PATH`, and run it again.

**"Can't reach the server" on the sign-in page.** The dashboard cannot reach Laravel. Check that `pnpm run dev` is still running and that `NEVELA_API_URL` in `apps/web/.env.local` matches Laravel's address, including the `/api` at the end.

**It says a newer create-nevela is out.** Your package manager served an older installer: pnpm holds back versions published in the last day, and both pnpm and npm cache. Run the command it prints, which asks for the new version by number, for example `pnpm create nevela@0.1.2 my-app`.

**The folder already exists.** The command refuses to write into a folder that has files in it. Pick another name or remove the folder.

## Options

| Option | Meaning |
|---|---|
| `--pm <pnpm\|npm\|yarn\|bun>` | Package manager for the dashboard. Default: the one you ran the command with. |
| `--no-install` | Don't install the dashboard's dependencies. |
| `--no-user` | Don't create the starter account. |
| `--no-git` | Don't run `git init`. |
| `--bundled-package` | Use the copy of `nevela/laravel` inside the installer instead of the release on Packagist. |
| `-y`, `--yes` | Ask nothing. Only the app name is ever asked for, and only if you leave it off. |

With npm, put options after `--`: `npm create nevela@latest my-app -- --no-install`.

## Next

- [Resources](/concepts/resources/): the field types and how regeneration works
- [REST API](/reference/api/): calling the API directly
- [Updating](/guides/updating/): bring the app up to a newer Nevela later
- [Deploying](/guides/deploying/): what each app needs in production
