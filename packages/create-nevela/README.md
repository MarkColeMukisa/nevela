# create-nevela

The `nevela` command. It creates a new [Nevela](https://nevela-docs.vercel.app) app, a Laravel API and a Next.js dashboard generated from one resource description, and runs everything inside one.

```sh
npm install -g create-nevela    # once
nevela new my-app
```

Or without installing anything:

```sh
pnpm create nevela my-app
# or
npm create nevela@latest my-app
```

You need PHP 8.3 or newer, Composer, and Node.js 20 or newer.

## What you get

```
my-app/
├─ apps/api/    a Laravel app with Sanctum and Nevela installed
├─ apps/web/    the Next.js dashboard, pointed at the API
└─ nevela       the app's own launcher: php nevela does what nevela does
```

Then:

```sh
cd my-app
nevela dev
```

Open http://localhost:3000/sign-in and sign in as `admin@example.com` with the password `password`. That starter account is in your local database only; add your own with `nevela user`.

The app starts with an administrator and ten sample users (two editors, eight users), in your local database only, so its Users and Roles screens have something to show. Leave the samples out with `--no-sample-users`.

Add your first resource, from the same folder:

```sh
nevela resource Product --fields="name:string, sku:string!, price:money"
```

That writes the Laravel code and the dashboard pages, and creates the table. `nevela` on its own lists everything else.

## Every command

```sh
nevela                 # anywhere: everything it can do
nevela new my-app      # anywhere: create an app (leave the name off and it asks)
nevela update          # anywhere: update the nevela command itself
nevela --version       # anywhere: the command's version, and the app's when in one
nevela dev             # inside an app: run the API and the dashboard
nevela upgrade         # inside an app: bring it to the latest Nevela
```

As in Grit, `update` is for the tool and `upgrade` is for an app.

## Upgrading an app later

```sh
nevela upgrade
```

That updates the Laravel package, regenerates, and upgrades the dashboard files you have not changed. Files you changed are kept, and everything it replaces is backed up first.

Without the command installed, `npx create-nevela upgrade` does the same, in any shell and on an app of any age. So does the app's own launcher, `php nevela upgrade`. See https://nevela-docs.vercel.app/guides/updating/.

## Options

| Option | Meaning |
|---|---|
| `--pm <pnpm\|npm\|yarn\|bun>` | Package manager for the dashboard. Default: the one you ran this with. |
| `--no-install` | Don't install the dashboard's dependencies. |
| `--fast` | Leave out PHPUnit, Pint and Laravel's other development packages. About a third quicker. |
| `--no-user` | Don't create the starter account. |
| `--no-git` | Don't run `git init`. |
| `--bundled-package` | Use the copy of `nevela/laravel` inside this installer instead of the release on Packagist. |
| `-y`, `--yes` | Ask nothing. Only the app name is ever asked for. |

Through npm's `create`, put options after `--`: `npm create nevela@latest my-app -- --no-install`.

## How it installs the Laravel package

`nevela/laravel` is installed from [Packagist](https://packagist.org/packages/nevela/laravel), at the release that matches this installer's version.

If Packagist has no matching release, or you pass `--bundled-package`, the copy that travels inside this installer is placed in `my-app/packages/nevela-laravel` and Composer installs it from there. That is how Nevela's own CI tests a change to the package before it is released.
