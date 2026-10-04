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
  ✔ Creating the Laravel app (1m 58s)
  ✔ Setting up the database (28s)
  ✔ Installing dashboard packages (pnpm) (36s)

  ✔ Created my-app in 2m 26s

  Then open http://localhost:3000/sign-in and sign in with:

    Email      admin@example.com
    Password   password
```

That timing is from a Windows laptop with antivirus running, which is the slow case. Most of it is unpacking Laravel's packages; the dashboard's packages download at the same time. On Linux and macOS it is usually under a minute.

To make it quicker still, leave out the development packages (PHPUnit, Pint and the like) and add them when you need them:

```sh
pnpm create nevela my-app --fast
```

About a third quicker. Add them later with `composer install` in `apps/api`.

The installer always uses its newest version. If your package manager hands it an older one, which pnpm does for a few hours after each release, it fetches the latest itself before doing anything.

You get this:

```
my-app/
├─ apps/api/    a Laravel app with Sanctum and Nevela installed
├─ apps/web/    the Next.js dashboard, pointed at the API
└─ nevela       every Nevela command, from this folder: php nevela
```

[Project structure](/start/project-structure/) explains what is where.

## 2. Run it

```sh
cd my-app
php nevela dev
```

That starts the Laravel API and the dashboard together and prints where each one is: normally http://127.0.0.1:8000 and http://localhost:3000. If another program is already using a port, it takes the next free one and tells the dashboard, so the two always find each other.

Open http://localhost:3000/sign-in and sign in with the starter account:

| | |
|---|---|
| Email | `admin@example.com` |
| Password | `password` |

:::caution[The starter account is for your machine]
It exists only in your local database. It is not in the code or in a migration, so it does not follow the app to a server. Still, don't keep a password everyone knows: add your own account and remove this one before anyone else can reach the app.

```sh
php nevela user
```
:::

## 3. Add a resource

Stay in `my-app`. Everything runs from there with `php nevela`:

```sh
php nevela resource Contact --fields="name:string, email:email!, company:string?, status:enum(lead|customer)" --icon=users
```

That one command writes the Laravel code and the dashboard pages, and creates the table. Reload the dashboard. Contacts is in the sidebar, with a table, a form and a detail page.

To have something to look at:

```sh
php nevela seed Contact --count=1000
```

Run `php nevela` on its own to see everything it can do.

## 4. Lock down who can do what

Every generated policy starts by allowing any signed-in user. Before real use, open `apps/api/app/Policies/ContactPolicy.php` and write your rules. The file is generated once and is yours from then on. See [Roles and policies](/guides/policies/).

## If something goes wrong

**"PHP isn't installed" or "Composer isn't installed".** The command checks for both before it starts. Install them, open a new terminal so they are on your `PATH`, and run it again.

**Not sure what state the app is in.** Ask it:

```sh
php nevela status
```

It lists the Nevela version, which migrations have run and which are pending, how many people can sign in, each resource and its record count, and whether the dashboard is reaching this app's API. Anything wrong is marked in red with the command that fixes it.

**Sign-in says the address "is answered by a different program".** Another program on your machine, often another Laravel project's `php artisan serve`, already had port 8000, and the dashboard reached that instead of this app. Start both with `php nevela dev`, which checks the port first and moves to a free one.

**"Can't reach the server" on the sign-in page.** The API is not running. Start it with `php nevela dev`.

**"php: command not found" in Git Bash.** With Laravel Herd on Windows, PHP is `php.bat`, and Git Bash does not run that when you type `php`. Use `pnpm nevela dev`, `pnpm nevela update` and so on, which work in every shell, or run `php nevela …` from PowerShell. The installer prints whichever form works in the shell you ran it from.

**The folder already exists.** The command refuses to write into a folder that has files in it. Pick another name or remove the folder.

## Options

| Option | Meaning |
|---|---|
| `--pm <pnpm\|npm\|yarn\|bun>` | Package manager for the dashboard. Default: the one you ran the command with. |
| `--no-install` | Don't install the dashboard's dependencies. |
| `--fast` | Leave out PHPUnit, Pint and Laravel's other development packages. About a third quicker. |
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
