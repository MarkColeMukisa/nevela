---
title: "Quickstart"
description: "Install the nevela command, create an app, sign in, and add your first resource."
---

This page takes you from an empty folder to a running dashboard with one resource in it.

## What you need

- PHP 8.3 or newer, with [Composer](https://getcomposer.org/download/)
- Node.js 20 or newer
- Nothing else. The database is SQLite by default, which needs no setup.

## 1. Get the nevela command

```sh
npm install -g create-nevela
```

Once, on your computer. Every command on this site is then `nevela` and a word, in any shell. `nevela --version` says which version you have, and `nevela update` brings it up to date.

You can skip this: `pnpm create nevela my-app` (or `npm create nevela@latest my-app`) creates an app without installing anything, and inside an app `php nevela dev` does what `nevela dev` does. [Without the nevela command](/reference/commands/#without-the-nevela-command) lists the longer forms.

## 2. Create the app

```sh
nevela new my-app
```

Leave the name off and it asks for one. It asks nothing else, and does the setup for you:

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
nevela new my-app --fast
```

About a third quicker. Add them later with `composer install` in `apps/api`.

A new app is always created by the newest installer. If the `nevela` command you have is older, it fetches the latest itself before doing anything.

The dashboard's packages are installed with pnpm when you have it, and npm otherwise. `--pm` picks another.

You get this:

```
my-app/
├─ apps/api/    a Laravel app with Sanctum and Nevela installed
├─ apps/web/    the Next.js dashboard, pointed at the API
└─ nevela       the app's own launcher: php nevela does what nevela does
```

[Project structure](/start/project-structure/) explains what is where.

## 3. Run it

```sh
cd my-app
nevela dev
```

That starts the Laravel API and the dashboard together and prints where each one is: normally http://127.0.0.1:8000 and http://localhost:3000. If another program is already using a port, it takes the next free one and tells the dashboard, so the two always find each other.

Open http://localhost:3000/sign-in and sign in with the starter account:

| | |
|---|---|
| Email | `admin@example.com` |
| Password | `password` |

That account is the administrator. Ten sample users are there too, with the same password: two editors and eight users. Open **Users** in the sidebar to see them and **Roles** to see what each may do, or sign in as `amara.okafor@example.com` (an editor) or `sofia.martinez@example.com` (a user) to see the dashboard as they do. [Users, roles and permissions](/guides/policies/) has the rest.

:::caution[These accounts are for your machine]
They exist only in your local database. They are not in the code or in a migration, so they do not follow the app to a server. Still, don't keep a password everyone knows: add your own account and delete these before anyone else can reach the app.

```sh
nevela user
```
:::

## 4. Add a resource

From anywhere inside `my-app`:

```sh
nevela resource Contact --fields="name:string, email:email!, company:string?, status:enum(lead|customer)" --icon=users
```

That one command writes the Laravel code and the dashboard pages, and creates the table. Reload the dashboard. Contacts is in the sidebar, with a table, a form and a detail page.

To have something to look at:

```sh
nevela seed Contact --count=1000
```

Run `nevela` on its own to see everything it can do.

## 5. Decide who can do what

The new resource came with four permissions: `contacts.view`, `contacts.create`, `contacts.edit` and `contacts.delete`. The administrator has them all, and so do the two sample editors. The sample users have none, so Contacts isn't in their sidebar.

Open **Roles** to change what a role allows or to make one of your own, and **Users** to give it to someone. For a rule that depends on the record itself, such as "only its owner may edit it", open `apps/api/app/Policies/ContactPolicy.php`: the file is generated once and is yours from then on. See [Users, roles and permissions](/guides/policies/).

## If something goes wrong

**"PHP isn't installed" or "Composer isn't installed".** The command checks for both before it starts. Install them, open a new terminal so they are on your `PATH`, and run it again.

**Not sure what state the app is in.** Ask it:

```sh
nevela status
```

It lists the Nevela version, which migrations have run and which are pending, how many people can sign in, each resource and its record count, and whether the dashboard is reaching this app's API. Anything wrong is marked in red with the command that fixes it.

**Sign-in says the address "is answered by a different program".** Another program on your machine, often another Laravel project's `php artisan serve`, already had port 8000, and the dashboard reached that instead of this app. Start both with `nevela dev`, which checks the port first and moves to a free one.

**"Can't reach the server" on the sign-in page.** The API is not running. Start it with `nevela dev`.

**"nevela: command not found".** The command isn't installed, or your terminal was open before it was. Run `npm install -g create-nevela` and open a new terminal. Without it, `pnpm nevela dev` works inside an app in every shell.

**"php: command not found" in Git Bash.** With Laravel Herd on Windows, PHP is `php.bat`, and Git Bash does not run that when you type `php`. The `nevela` command is not affected: it finds PHP itself. Only the longer form `php nevela …` needs PowerShell there.

**`nevela update` seems to change nothing.** The command is probably installed twice. `nevela --version` says so and prints what removes the extra copy. See [If an update seems to change nothing](/guides/updating/#if-an-update-seems-to-change-nothing).

**The folder already exists.** The command refuses to write into a folder that has files in it. Pick another name or remove the folder.

## Options for nevela new

| Option | Meaning |
|---|---|
| `--pm <pnpm\|npm\|yarn\|bun>` | Package manager for the dashboard. Default: pnpm when you have it, and npm otherwise. |
| `--no-install` | Don't install the dashboard's dependencies. |
| `--fast` | Leave out PHPUnit, Pint and Laravel's other development packages. About a third quicker. |
| `--no-user` | Don't create the starter account, or the sample users. |
| `--no-sample-users` | Create the administrator only, without the ten sample users. |
| `--no-git` | Don't run `git init`. |
| `--bundled-package` | Use the copy of `nevela/laravel` inside the installer instead of the release on Packagist. |
| `-y`, `--yes` | Ask nothing. Only the app name is ever asked for, and only if you leave it off. |

Through npm's `create`, put options after `--`: `npm create nevela@latest my-app -- --no-install`.

## Next

- [Build a shop](/guides/shop/): two linked resources, with images that are optimised on upload
- [Resources](/concepts/resources/): the field types and how regeneration works
- [REST API](/reference/api/): calling the API directly
- [Updating and upgrading](/guides/updating/): bring the app up to a newer Nevela later
- [Deploying](/guides/deploying/): what each app needs in production
