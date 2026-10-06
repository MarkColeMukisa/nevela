# Nevela

Nevela is a Laravel-first full-stack framework. **Laravel is the authority**: it owns data, validation, authorization, jobs and the API. **The UI is Flare's Next.js frontend** (by Muke Johnbaptist / JB, `MUKE-coder/flare-framework`), with its data and sign-in layer pointed at Laravel. **One resource description drives both.**

## Create an app

```sh
npm install -g create-nevela    # once: the nevela command
nevela new my-app
cd my-app
nevela dev
```

You need PHP 8.3+, Composer and Node.js 20+. Sign in at http://localhost:3000/sign-in as `admin@example.com` with the password `password`. Everything else is `nevela` and a word, from anywhere in the app: `nevela resource …`, `nevela seed …`, `nevela user`, `nevela upgrade`. `nevela --version` says which version you have, and `nevela update` brings the command up to date.

Without installing anything, `pnpm create nevela my-app` creates an app, and inside it `php nevela dev` does what `nevela dev` does. The docs are at https://nevela-docs.vercel.app.

## Add a resource

```sh
nevela resource Product --fields="name:string, sku:string!, price:money, kind:enum(stock|digital), notes:text?" --icon=package
```

That one command writes:

| Laravel (`apps/api`) | Next.js (`apps/web`) |
|---|---|
| `nevela/resources/product.json`: the descriptor | `resources/product.resource.ts`: Flare `defineResource` |
| Model (UUID ids), migration, form request, API resource | `resources/index.ts`: the registry of descriptors |
| Controller speaking Flare's REST contract, policy | `app/dashboard/products/…`: list, new, detail and edit pages |
| `routes/nevela.php`: loaded automatically under `/api` + `auth:sanctum` | |

## Signing in

Accounts live in Laravel; the screens are Flare's. Beside the password there is two-factor (an authenticator app or emailed codes, with backup codes), passkeys, emailed sign-in links and codes, password reset and email verification. Each account has a profile with a picture, and a list of the devices signed in to it. Sign-up is off until you set `NEVELA_REGISTRATION=true`. See https://nevela-docs.vercel.app/guides/authentication/.

## Layout

```
nevela/
├─ packages/laravel/        nevela/laravel: Composer package (generator + runtime)
├─ packages/create-nevela/  the `nevela` command (and `pnpm create nevela`)
├─ apps/api/           a Laravel app using the package
├─ apps/web/           Flare's Next.js dashboard, backed by Laravel
├─ apps/docs/           the documentation site (Astro Starlight)
└─ CHANGELOG.md
```

## Working on Nevela itself

The rest of this page is for changing the framework. Laravel side:

```sh
cd apps/api
composer install
php artisan migrate
php artisan nevela:user
php artisan serve
```

Web side, in a second terminal:

```sh
pnpm install
cd apps/web
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3000/sign-in and sign in with the user you created.

## Starting a new Laravel app instead

```sh
composer create-project laravel/laravel apps/api
cd apps/api
php artisan install:api                      # Sanctum + routes/api.php
composer config repositories.nevela path ../../packages/laravel
composer require nevela/laravel:@dev
```

Add `use Laravel\Sanctum\HasApiTokens;` to `app/Models/User.php` (and `use HasApiTokens, …` in the class). Then:

```sh
php artisan nevela:resource Product --fields="name:string, sku:string!, price:money, active:boolean, kind:enum(stock|digital), notes:text?" --icon=package --group=Catalogue
php artisan migrate
```

Web files are written to `../web` by default (`NEVELA_WEB_PATH` or `config/nevela.php` changes that). If that folder doesn't exist, the web files are skipped.

Calling the API directly:

```sh
curl -X POST localhost:8000/api/auth/token -H "Accept: application/json" -d email=you@example.com -d password=<yours>
curl -g "localhost:8000/api/products?sort=-price&filter[kind]=digital" -H "Authorization: Bearer <token>" -H "Accept: application/json"
```

## Field grammar

`name:type`, comma-separated. Suffix `?` = optional (nullable), `!` = unique.

`string text email url tel slug color int float money percent rating boolean date datetime enum(a|b|c) belongsTo(Resource) image file(pdf|…)`

A shop in two commands: categories, and products that belong to one, each with an image that is resized and compressed when it is uploaded.

```sh
nevela resource Category --fields="name:string, slug:slug!, image:image?" --seed=8
nevela resource Product --fields="name:string, price:money, image:image(product)?, category:belongsTo(Category)" --seed=40
```

## Changing a resource

Edit `nevela/resources/<name>.json`, then `nevela generate`. Generated code lives between `// nevela:generated:start` and `// nevela:generated:end`. Code outside that block is yours and is never touched. If you edit *inside* a block, regeneration skips that file and tells you (`--force` overrides). Migrations, policies and dashboard pages are written once and then belong to you; add a new migration when fields change.

## Seeding

```sh
nevela seed Product --count=1000
```

Fills a resource with plausible records made from its descriptor, and prints how long it took:

```
 INFO  Seeded 1,000 Products in 114 ms (8,809 rows/s).
```

Unique fields stay unique across repeated runs, and a unique field with few possible values (an enum, a rating) is refused up front if `--count` is more than it can hold. `--fresh` deletes the resource's existing records first. The delete and the inserts share one transaction, so a failed run leaves the table as it was. Rows are inserted directly, so model events do not fire.

## Package tests

```sh
cd packages/laravel && composer install && vendor/bin/phpunit
```

## License

MIT. Copyright (c) 2026 Mark Cole MUKISA. The dashboard in `apps/web` is derived from [Flare](https://github.com/MUKE-coder/flare-framework) by Muke Johnbaptist, also MIT; its licence is kept in `apps/web/LICENSE-flare`.

## Documentation

The documentation is a website in [apps/docs](apps/docs): getting started, field types, commands, the REST API, the web app, configuration and releasing. Run it with:

```sh
pnpm install
pnpm docs:dev
```

Changes per version are in [CHANGELOG.md](CHANGELOG.md), which the site also shows.
