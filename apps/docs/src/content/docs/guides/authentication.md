---
title: "Authentication"
description: "How sign-in works: Sanctum tokens in Laravel, an httpOnly cookie in the web app."
---

Laravel issues [Sanctum](https://laravel.com/docs/sanctum) personal access tokens. The web app keeps the token in a cookie and sends it to Laravel from the server.

## In the dashboard

The sign-in form posts the email and password to Laravel's `POST /auth/token`. The token it returns is stored in a cookie named `nevela_token` that scripts in the page cannot read. It lasts 30 days.

Signing out calls `DELETE /auth/token`, which revokes the token in Laravel, then removes the cookie.

If a token is revoked in Laravel, the next page load finds `GET /auth/me` answering 401 and sends the visitor to `/sign-in`.


## Creating users

The dashboard has no sign-up page yet. Create users in the Laravel app:

```sh
php artisan nevela:user
```

It asks for a name, an email and a password, and the password is not shown as you type. See [Commands](/reference/commands/#nevelauser) for the options.

The user model needs Sanctum's `HasApiTokens` trait. `pnpm create nevela` adds it for you.

## Over the API

Every endpoint except `POST /auth/token` needs a token.

### Get a token

```sh
curl -X POST http://127.0.0.1:8000/api/auth/token \
  -H "Accept: application/json" -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "your-password"}'
```

```json
{
  "token": "1|x8Jq…",
  "user": { "id": "1", "name": "Admin", "email": "admin@example.com", "role": null }
}
```

The response status is 201. Wrong credentials give 422 with the message on the `email` field. This endpoint allows six attempts a minute.

`deviceName` is an optional third field that names the token.

### Use the token

```sh
curl http://127.0.0.1:8000/api/products -H "Accept: application/json" -H "Authorization: Bearer 1|x8Jq…"
```

### Other auth endpoints

| Request | Response |
|---|---|
| `GET /auth/me` | `200 { "user": { id, name, email, role } }` |
| `DELETE /auth/token` | `204`. The token used for the request stops working. |


## Using your own auth

Set `auth.enabled` to `false` in `config/nevela.php` and Nevela stops registering the token endpoints. The resource routes still use the `middleware` setting, `auth:sanctum` by default. See [Configuration](/guides/configuration/).
