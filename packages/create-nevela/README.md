# create-nevela

Create a new [Nevela](https://nevela-docs.vercel.app) app: a Laravel API and a Next.js dashboard, generated from one resource description.

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
└─ scripts/     `dev` runs both together
```

Then:

```sh
cd my-app
pnpm run dev
```

Open http://localhost:3000/sign-in and sign in as `admin@example.com` with the password `password`. That starter account is in your local database only; add your own with `php artisan nevela:user`.

Add your first resource, from the same folder:

```sh
php nevela resource Product --fields="name:string, sku:string!, price:money"
```

That writes the Laravel code and the dashboard pages, and creates the table. `php nevela` lists everything else.

## Updating an app later

```sh
php nevela update
```

That updates the Laravel package, regenerates, and updates the dashboard files you have not changed. See https://nevela-docs.vercel.app/guides/updating/.

## Options

| Option | Meaning |
|---|---|
| `--pm <pnpm\|npm\|yarn\|bun>` | Package manager for the dashboard. Default: the one you ran this with. |
| `--no-install` | Don't install the dashboard's dependencies. |
| `--no-user` | Don't create the starter account. |
| `--no-git` | Don't run `git init`. |
| `--bundled-package` | Use the copy of `nevela/laravel` inside this installer instead of the release on Packagist. |
| `-y`, `--yes` | Ask nothing. Only the app name is ever asked for. |

With npm, put options after `--`: `npm create nevela@latest my-app -- --no-install`.

## How it installs the Laravel package

`nevela/laravel` is installed from [Packagist](https://packagist.org/packages/nevela/laravel), at the release that matches this installer's version.

If Packagist has no matching release, or you pass `--bundled-package`, the copy that travels inside this installer is placed in `my-app/packages/nevela-laravel` and Composer installs it from there. That is how Nevela's own CI tests a change to the package before it is released.
