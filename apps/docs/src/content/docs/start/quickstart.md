---
title: "Quickstart"
description: "From a fresh clone to a running dashboard with one resource in it."
---

This page takes you from a fresh clone to a running dashboard with one resource in it.

## What you need

- PHP 8.3 or newer, with Composer
- Node.js 20 or newer, with pnpm
- A database Laravel supports. The default is SQLite, which needs no setup.

## 1. Run the Laravel app

```sh
cd apps/api
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
```

Create a user to sign in with. Users are created in Laravel; the dashboard has no sign-up page.

```sh
php artisan tinker --execute="App\Models\User::create(['name' => 'Admin', 'email' => 'admin@example.com', 'password' => 'choose-a-password']);"
```

Keep the spaces around `=>`. In Windows PowerShell, a command with no spaces in it is passed on without quotes, the `>` is read as a file redirect, and no user is created.

Start the server:

```sh
php artisan serve
```

Laravel is now on http://127.0.0.1:8000.

## 2. Run the web app

In a second terminal, from the repository root:

```sh
pnpm install
cd apps/web
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3000/sign-in and sign in with the user you created.

If you see "Can't reach the server", the web app cannot reach Laravel. Check that `php artisan serve` is running and that `NEVELA_API_URL` in `apps/web/.env.local` matches its address, including the `/api` at the end.

## 3. Create a resource

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

Every generated policy starts by allowing any signed-in user. Before real use, open `apps/api/app/Policies/ContactPolicy.php` and write your rules. The file is generated once and is yours from then on.

## Starting from an empty Laravel app

The repository ships with `apps/api` already set up. To add Nevela to a new Laravel app instead:

```sh
composer create-project laravel/laravel apps/api
cd apps/api
php artisan install:api
composer config repositories.nevela path ../../packages/laravel
composer require nevela/laravel:@dev
```

Then add the Sanctum trait to `app/Models/User.php`:

```php
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;
}
```

Without that trait, sign-in fails with a message naming the model to fix.

## Next

- [Resources](/concepts/resources/): the field types and how regeneration works
- [REST API](/reference/api/): calling the API directly
