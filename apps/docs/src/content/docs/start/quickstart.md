---
title: "Quickstart"
description: "Install the nevela command, create an app, sign in, and add your first resource."
---

This page takes you from an empty folder to a running app, a public site and a staff admin on one API, with one resource in it.

## What you need

- PHP 8.5 or newer, with [Composer](https://getcomposer.org/download/)
- Node.js 20 or newer
- Nothing else. The database is SQLite by default, which needs no setup.

On a new computer, or if you aren't sure you have them, start with [Set up your computer](/start/setup/): what to install on macOS, Windows and Linux, in order, and how to check each one.

## 1. Get the nevela command

```sh
bun add -g create-nevela
```

Without [Bun](/start/setup/#bun-for-faster-installs), `npm install -g create-nevela` does the same. Once, on your computer. Every command on this site is then `nevela` and a word, in any shell. `nevela --version` says which version you have, and `nevela update` brings it up to date.

You can skip this: `bun create nevela@latest my-app` (or `npm create nevela@latest my-app`) creates an app without installing anything, and inside an app `php nevela dev` does what `nevela dev` does. [Without the nevela command](/reference/commands/#without-the-nevela-command) lists the longer forms.

## 2. Create the app

```sh
nevela new my-app
```

Leave the name off and it asks for one. It asks nothing else, and does the setup for you. Each thing it makes gets a line, and the line in hand shows what it is on: the package that just landed, the table being created.

```
  ✔ Project folder           my-app                                        3ms
  ✔ Dashboard                Next.js · 208 files                         174ms
  ✔ Laravel app              laravel/laravel v13.11.0                     6.2s
  ✔ Laravel packages         119 packages                               1m 12s
  ✔ Environment              .env · SQLite · API tokens                   76ms
  ✔ Database                 16 migrations                               24.8s
  ✔ Administrator            admin@example.com
  ✔ Sample users             2 editors · 8 users
  ✔ Blog                     Post resource · 3 posts · /blog
  ✔ Site packages            bun · 140 packages                           6.1s
  ✔ Admin packages           bun · 140 packages                           5.4s
  ✔ Git repository           git init                                    412ms

  Created my-app  Laravel API · site · admin · blog · 2m 08s

  Then open the admin at http://localhost:3001/sign-in and sign in with:

    Email      admin@example.com
    Password   password
```

That timing is from a Windows laptop with antivirus running, which is the slow case. Most of it is unpacking Laravel's packages; the web apps' packages download at the same time. On Linux and macOS it is usually under a minute.

To make it quicker still, leave out the development packages (PHPUnit, Pint and the like) and add them when you need them:

```sh
nevela new my-app --fast
```

About a third quicker. Add them later with `composer install` in `apps/api`.

A new app is always created by the newest installer. If the `nevela` command you have is older, it fetches the latest itself before doing anything.

The web apps' and the phone app's packages are installed with [Bun](https://bun.sh) when you have it, which is several times faster, and with npm otherwise. `--pm npm` or `--pm pnpm` picks another. Bun installs the packages and runs the scripts; the web apps still run on Node in production.

You get this:

```
my-app/
├─ apps/api/    a Laravel app with Sanctum and Nevela installed
├─ apps/web/    the public site and the customer area (Next.js)
├─ apps/admin/  the staff's admin: the dashboard (Next.js)
└─ nevela       the app's own launcher: php nevela does what nevela does
```

[Project structure](/start/project-structure/) explains what is where.

## 3. Run it

```sh
cd my-app
nevela dev
```

That starts the Laravel API, the site and the admin together and prints where each one is: normally http://127.0.0.1:8000, http://localhost:3000 and http://localhost:3001. If another program is already using the API's port, it takes the next free one and tells the web apps, so they always find it.

The two web apps are one template, each without what the other has. The site is what customers see: the public pages, and their own account at `/account`. The admin is where staff work: the dashboard, with no public pages. A customer who signs in to the admin is kept to their own account there. To let people sign up on the site, set `NEVELA_REGISTRATION=true` in `apps/api/.env`.

Open the admin at http://localhost:3001/sign-in and sign in with the starter account:

| | |
|---|---|
| Email | `admin@example.com` |
| Password | `password` |

That account is the administrator. Ten sample users are there too, with the same password: two editors and eight users. Open **Users** in the sidebar to see them and **Roles** to see what each may do, or sign in as `amara.okafor@example.com` (an editor) to see the dashboard as they do. `sofia.martinez@example.com` holds only the role people sign up with, so she is a customer: sign in as her on the site, http://localhost:3000/sign-in, to see her account. [Users, roles and permissions](/guides/policies/) has the rest.

The app also has a blog. Open http://localhost:3000/blog: a post for each of Nevela's tutorials is on it, and the newest three are on the home page, and **Posts** in the admin is where they are written. [The blog](/guides/blog/) says how it works and how to change it, and `nevela new my-app --no-blog` leaves it out.

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

That one command writes the Laravel code and the dashboard pages (in the admin), and creates the table. Reload the admin. Contacts is in the sidebar, with a table, a form and a detail page.

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

**"nevela: command not found".** The command isn't installed, or your terminal was open before it was. Run `bun add -g create-nevela` (or `npm install -g create-nevela`) and open a new terminal. Without it, `bun run nevela dev` (`npm run nevela -- dev` in an app made with npm) works inside an app in every shell.

**"php: command not found" in Git Bash.** With Laravel Herd on Windows, PHP is `php.bat`, and Git Bash does not run that when you type `php`. The `nevela` command is not affected: it finds PHP itself. Only the longer form `php nevela …` needs PowerShell there.

**`nevela update` seems to change nothing.** The command is probably installed twice. `nevela --version` says so and prints what removes the extra copy. See [If an update seems to change nothing](/guides/updating/#if-an-update-seems-to-change-nothing).

**The folder already exists.** The command refuses to write into a folder that has files in it. Pick another name or remove the folder.

## Options for nevela new

| Option | Meaning |
|---|---|
| `--tier <web\|both\|mobile\|admin>` | Which apps it has. `web`: the triple tier, a public site with a customer area (`apps/web`), the staff's admin (`apps/admin`) and the API. `both`: those and [a phone app](/guides/mobile-app/) (Expo). `mobile`: the API and a phone app, with no web apps. `admin`: the API and the admin alone, for an internal tool. Asked when left off; `web` with `--yes`. |
| `--mail <resend\|brevo\|smtp>` | How it [sends email](/guides/deploying/#mail) on a server. Asked when left off; `resend` with `--yes`. On your computer, emails go to the log until you set `MAIL_MAILER` and its settings in `apps/api/.env`. |
| `--pm <bun\|npm\|pnpm\|yarn>` | Package manager for the web apps and the phone app. Default: Bun when you have it, and npm otherwise; run through `pnpm create`, `yarn create` or `bun create`, that one. |
| `--no-install` | Don't install the web apps' or the phone app's dependencies. |
| `--fast` | Leave out PHPUnit, Pint and Laravel's other development packages. About a third quicker. |
| `--no-user` | Don't create the starter account, or the sample users. |
| `--no-sample-users` | Create the administrator only, without the ten sample users. |
| `--no-blog` | Leave out [the blog](/guides/blog/): the Post resource, its sample posts and `/blog`. |
| `--mobile` | The same as `--tier both`: [a phone app](/guides/mobile-app/) beside the site and the admin. |
| `--no-git` | Don't run `git init`. |
| `--bundled-package` | Use the copy of `nevela/laravel` inside the installer instead of the release on Packagist. |
| `-y`, `--yes` | Ask nothing: a web app that sends email with Resend, unless the options say otherwise. The name is asked for only when you leave it off. |

Through npm's `create`, put options after `--`: `npm create nevela@latest my-app -- --no-install`.

## Next

- [Tutorials](/tutorials/): real apps built from scratch, step by step, starting with [Contacts](/tutorials/contacts/)
- [Build a shop](/guides/shop/): two linked resources, with images that are optimised on upload
- [The blog](/guides/blog/): the one your app came with, and how it is put together
- [Resources](/concepts/resources/): the field types and how regeneration works
- [REST API](/reference/api/): calling the API directly
- [Updating and upgrading](/guides/updating/): bring the app up to a newer Nevela later
- [Deploying](/guides/deploying/): what each app needs in production
