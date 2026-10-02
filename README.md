# Nevela

Nevela is a Laravel-first full-stack framework. **Laravel is the authority**: it owns data, validation, authorization, jobs and the API. **The UI is Flare's Next.js frontend** (by Muke Johnbaptist / JB, `MUKE-coder/flare-framework`), with its data and sign-in layer pointed at Laravel. **One resource description drives both.**

```
php artisan nevela:resource Product --fields="name:string, sku:string!, price:money, kind:enum(stock|digital), notes:text?" --icon=package
```

That one command writes:

| Laravel (`apps/api`) | Next.js (`apps/web`) |
|---|---|
| `nevela/resources/product.json`: the descriptor | `resources/product.resource.ts`: Flare `defineResource` |
| Model (UUID ids), migration, form request, API resource | `resources/index.ts`: the registry of descriptors |
| Controller speaking Flare's REST contract, policy | `app/dashboard/products/…`: list, new, detail and edit pages |
| `routes/nevela.php`: loaded automatically under `/api` + `auth:sanctum` | |

## Layout

```
nevela/
├─ packages/laravel/   nevela/laravel: Composer package (generator + runtime)
├─ apps/api/           a Laravel app using the package
├─ apps/web/           Flare's Next.js dashboard, backed by Laravel
└─ docs/architecture.md
```

## Run it

Laravel side:

```sh
cd apps/api
composer install
php artisan migrate
php artisan tinker --execute="App\Models\User::create(['name' => 'Admin', 'email' => 'admin@example.com', 'password' => 'admin123']);"
php artisan serve
```

Keep the spaces around `=>` in that command. Without any spaces, Windows PowerShell passes it to `php` unquoted, the `>` is treated as a file redirect, and the command fails without creating the user.

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

`string text email url tel slug color int float money percent rating boolean date datetime enum(a|b|c)`

## Changing a resource

Edit `nevela/resources/<name>.json`, then `php artisan nevela:generate`. Generated code lives between `// nevela:generated:start` and `// nevela:generated:end`. Code outside that block is yours and is never touched. If you edit *inside* a block, regeneration skips that file and tells you (`--force` overrides). Migrations, policies and dashboard pages are written once and then belong to you; add a new migration when fields change.

## Seeding

```sh
php artisan nevela:seed Product --count=1000
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

See [docs/architecture.md](docs/architecture.md) for the contract and the roadmap.
