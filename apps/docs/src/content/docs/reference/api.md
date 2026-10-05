---
title: "REST API"
description: "Every endpoint, the query parameters, and the error responses."
---

Every resource gets the same set of endpoints. They follow the format Flare's client expects, so the dashboard works against them unchanged, and you can call them from anything else that speaks HTTP.

All paths below are under the prefix `/api`. Send `Accept: application/json` on every request.

## Signing in

Every resource endpoint needs a token. The endpoints that get you one (a password, a passkey, an emailed link or code) do not: they are listed under [Every auth endpoint](#every-auth-endpoint). The [Authentication guide](/guides/authentication/) describes what each is for.

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

The response status is 201. Wrong credentials give 401 with `code: INVALID_EMAIL_OR_PASSWORD`, and the same answer whether or not the address has an account. Ten attempts a minute are allowed per account.

`deviceName` is an optional third field that names the token.

### Use the token

```sh
curl http://127.0.0.1:8000/api/products -H "Accept: application/json" -H "Authorization: Bearer 1|x8Jq…"
```

### When the account has two-factor on

`POST /auth/token` answers 200 with no token:

```json
{ "twoFactor": true, "challenge": "Lh8IN0Fh…", "methods": ["totp", "email", "backup"] }
```

Finish with the code. `method` is `totp` (an authenticator app), `email` or `backup`:

```sh
curl -X POST http://127.0.0.1:8000/api/auth/two-factor/verify \
  -H 'Accept: application/json' -H 'Content-Type: application/json' \
  -d '{"challenge": "Lh8IN0Fh…", "method": "totp", "code": "482913"}'
```

That answers 201 with the token. For `email`, ask for the code first with `POST /auth/two-factor/send` and the same `challenge`. The challenge lasts ten minutes and allows five wrong codes.

### Every auth endpoint

All are under `/api/auth`. The ones marked 🔒 need a token.

| | Endpoint | Does |
|---|---|---|
| | `GET /config` | Which sign-in methods are switched on. |
| | `POST /token` | Sign in with `email` and `password`. |
| | `POST /two-factor/send`, `/two-factor/verify` | The second step of a password sign-in. |
| | `POST /passkey/options`, `/passkey` | Sign in with a passkey. |
| | `POST /magic-link`, `/magic-link/verify` | Email a sign-in link; sign in with its `token`. |
| | `POST /email-code`, `/email-code/verify` | Email a sign-in code; sign in with `email` and `code`. |
| | `POST /register` | Create an account, when registration is on. |
| | `POST /email/send`, `/email/verify` | Send the verification email; verify with `email` and `code`. |
| | `POST /password/forgot`, `/password/reset` | Email a reset link; set `newPassword` with its `token`. |
| 🔒 | `GET /me`, `PATCH /me` | The signed-in user; change `name` or `avatar`. |
| 🔒 | `PUT /avatar?name=me.jpg` | Upload a profile picture. The body is the file. |
| 🔒 | `POST /password` | Change the password: `currentPassword`, `newPassword`. |
| 🔒 | `GET /sessions`, `DELETE /sessions`, `DELETE /sessions/{id}` | List devices; sign out the others, or one. |
| 🔒 | `POST /two-factor/enable`, `/confirm`, `/disable`, `/backup-codes` | Set up and manage the second step. |
| 🔒 | `GET /passkeys`, `POST /passkeys/options`, `POST /passkeys`, `PATCH`/`DELETE /passkeys/{id}` | List, add, rename and remove passkeys. |
| 🔒 | `DELETE /token` | Sign out: the token stops working. |

An error has a `code` beside its message, such as `INVALID_EMAIL_OR_PASSWORD`, `INVALID_TWO_FACTOR_CODE`, `OTP_EXPIRED` or `TOO_MANY_ATTEMPTS`. A method that is switched off answers 404. Attempts are limited to ten a minute per account, after which the answer is 429.

### Other auth endpoints

| Request | Response |
|---|---|
| `GET /auth/me` | `200 { "user": { id, name, email, role, emailVerified, twoFactorEnabled, avatar, avatarFile, image }, "session": { id } }` |
| `DELETE /auth/token` | `204`. The token used for the request stops working. |

## Resource endpoints

Using `products` as the example:

| Request | What it does | Success |
|---|---|---|
| `GET /products` | List records | `200 { data, meta }` |
| `GET /products/{id}` | One record | `200` the record |
| `POST /products` | Create | `201` the record, with a `Location` header |
| `PATCH /products/{id}` | Change some fields | `200` the record |
| `PUT /products/{id}` | Replace the record | `200` the record |
| `DELETE /products/{id}` | Delete | `204` |
| `GET /products/_stats` | Counts for dashboards | `200 { total, current, previous, values }` |

### A record

```json
{
  "id": "01a0fd2e-fc37-7264-b9ef-d52f2946a935",
  "name": "Widget",
  "sku": "W-1",
  "price": 19.5,
  "active": true,
  "kind": "stock",
  "notes": null,
  "createdAt": "2026-10-02T15:15:10.000000Z",
  "updatedAt": "2026-10-02T15:15:10.000000Z"
}
```

Keys are camelCase, matching the descriptor. The `id` is a UUID string. Dates are `YYYY-MM-DD` and timestamps are ISO 8601.

### Listing

```
GET /products?page=2&perPage=25&sort=-price&q=lamp&filter[kind]=stock
```

| Parameter | Meaning |
|---|---|
| `page` | Page number, from 1. Default 1. |
| `perPage` | Records per page. Default 25, at most 100. |
| `sort` | A field name to sort by. Prefix with `-` for descending. `createdAt` and `updatedAt` work too. Default `-createdAt`. `text` fields cannot be sorted. |
| `q` | Search text. Matches any `string` field that contains it. |
| `filter[field]` | Keep records where the field equals the value. Use `true` or `false` for booleans. An empty value or `null` matches records where an optional field is empty. `text` fields cannot be filtered. |

```json
{
  "data": [ { "id": "…", "name": "Lamp" } ],
  "meta": { "page": 2, "perPage": 25, "total": 137, "totalPages": 6 }
}
```

With curl, add `-g` so the square brackets in `filter[kind]` are sent as written.

### Creating and changing

Send the fields as JSON:

```sh
curl -X POST http://127.0.0.1:8000/api/products \
  -H "Accept: application/json" -H "Content-Type: application/json" -H "Authorization: Bearer …" \
  -d '{"name": "Lamp", "sku": "L-1", "price": 42, "active": true, "kind": "stock"}'
```

The difference between the two ways to update:

| Method | Fields you leave out |
|---|---|
| `PATCH` | Stay as they are. Only the fields you send are checked and changed. |
| `PUT` | Optional fields are cleared. Required fields must be sent. |

A key that is not a field of the resource is rejected with 422 rather than ignored, so a misspelt field name does not pass unnoticed. `id`, `createdAt` and `updatedAt` may be included and are ignored.

### Stats

```
GET /products/_stats?field=kind&days=7
```

```json
{ "total": 1000, "current": 118, "previous": 104, "values": { "digital": 489, "stock": 511 } }
```

| Key | Meaning |
|---|---|
| `total` | All records. |
| `current` | Records created in the last `days` days. |
| `previous` | Records created in the `days` before that. |
| `values` | Records per value of `field`. Empty when `field` is not given. |

`days` is 1 to 365, default 7. `field` must be an enum or boolean field.

## Relations

A `belongsTo` field is the related record's id, in what you send and in what comes back:

```json
{ "name": "Smart Kettle", "categoryId": "01a10804-7b04-72d6-aabf-a2113b9b6bc5" }
```

An id that is not a record of that resource is a 422. Filter a list by it with `filter[categoryId]=…`.

Deleting a record that others are required to belong to is a 409:

```json
{ "error": "8 products belong to this category. Move or delete them first." }
```

## Files

| Method | Path | Does |
|---|---|---|
| `PUT` | `/api/_nevela/uploads/{Resource}/{field}?name=kettle.jpg` | Stores a file. The request body is the file itself. |
| `GET` | `/api/_nevela/files/{key}` | The stored file. No token needed. |
| `GET` | `/api/_nevela/profiles` | The image profiles and their renditions. |

An upload answers 201 with the file's details:

```json
{
  "key": "products/image/2026/10/778e5b3c-5a55-4b18-bdfa-4da5f1151a93-kettle.webp",
  "url": "http://127.0.0.1:8000/api/_nevela/files/products/image/2026/10/778e5b3c-5a55-4b18-bdfa-4da5f1151a93-kettle.webp",
  "name": "kettle.jpg",
  "mime": "image/webp",
  "size": 87040,
  "width": 1000,
  "height": 750,
  "optimised": true,
  "renditions": {
    "thumb": { "url": "…-kettle.thumb.webp", "width": 300, "height": 300, "size": 22118 }
  }
}
```

Send the `key` as the field's value when you create or change the record. A record comes back with the key in the field and these details beside it, as `<field>File` (`imageFile` for `image`), or `null` when the field is empty.

| Status | When |
|---|---|
| 404 | The resource, or a file field of that name, does not exist. |
| 413 | The file is larger than `uploads.max_bytes`. |
| 422 | The contents are not a kind the field accepts, or do not match what the file was sent as. |

A record refuses a key that was not uploaded to that same field.

## Errors

Every error is JSON with an `error` message.

| Status | When | Body |
|---|---|---|
| 400 | A bad list parameter, such as sorting by an unknown field | `{ error, issues: [{ param, message }] }` |
| 401 | No token, or one that is no longer valid | `{ error }` |
| 403 | The policy says no | `{ error }` |
| 404 | No record with that id | `{ error }` |
| 409 | A unique value was taken between validation and saving | `{ error, field }` |
| 422 | Validation failed | `{ error, issues: [{ path, message }] }` |
| 429 | Too many requests | `{ error }` |

A validation error names each field:

```json
{
  "error": "Validation failed.",
  "issues": [
    { "path": "name", "message": "The name field is required." },
    { "path": "sku", "message": "The sku has already been taken." }
  ]
}
```

A duplicate value in a unique field is normally a 422 like the one above, because the validation rule catches it. The 409 only happens when two requests race.

## Checking who is answering

```
GET /_nevela/ping
```

Needs no token. Returns `{ "nevela": "0.1.3", "app": "3cd733775782" }`: the Nevela version, and a short id for this installation. It is how `php nevela status` and the dashboard tell this app's API from another program on the same port.

## Listing the resources

```
GET /_nevela/resources
```

Returns `{ "data": [ … ] }` with every descriptor. Tooling can use it to check that the web app and the API describe the same resources.

## Adding your own routes

`routes/nevela.php` is loaded under the same prefix and middleware. Add routes below its generated block and they get the token check and the same error format:

```php
// nevela:generated:end

Route::post('products/{product}/archive', [ProductController::class, 'archive']);
```
