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

:::note[Before the first npm release]
`create-nevela` is not on npm yet. Until it is, run it straight from GitHub:

```sh
pnpm dlx github:MarkColeMukisa/nevela my-app
```

With npm the same thing is `npx --allow-git=all github:MarkColeMukisa/nevela my-app`. Recent versions of npm refuse packages from git unless you allow them.
:::

It does the setup for you:

```
  ✔ Creating the Laravel app
  ✔ Adding token sign-in (Sanctum)
  ✔ Installing Nevela
  ✔ Adding the dashboard
  ✔ Installing the dashboard's dependencies with pnpm

  Create a user to sign in with now? (Y/n)
```

Answer yes and it asks for a name, an email and a password. That is the account you sign in with.

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

That starts Laravel on http://127.0.0.1:8000 and the dashboard on http://localhost:3000. Open http://localhost:3000/sign-in and sign in.

If you skipped creating a user, do it now, in a second terminal:

```sh
cd apps/api
php artisan nevela:user
```

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

**The folder already exists.** The command refuses to write into a folder that has files in it. Pick another name or remove the folder.

## Options

| Option | Meaning |
|---|---|
| `--pm <pnpm\|npm\|yarn\|bun>` | Package manager for the dashboard. Default: the one you ran the command with. |
| `--no-install` | Don't install the dashboard's dependencies. |
| `--no-user` | Don't ask to create the first user. |
| `--no-git` | Don't run `git init`. |
| `-y`, `--yes` | Ask nothing; take the defaults. |

With npm, put options after `--`: `npm create nevela@latest my-app -- --no-install`.

## Next

- [Resources](/concepts/resources/): the field types and how regeneration works
- [REST API](/reference/api/): calling the API directly
- [Deploying](/guides/deploying/): what each app needs in production
