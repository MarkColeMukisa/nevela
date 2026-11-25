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
  "expiresAt": "2026-10-20T09:15:00.000000Z",
  "refreshToken": "kq0…",
  "refreshExpiresAt": "2026-10-27T09:00:00.000000Z",
  "user": {
    "id": "1", "name": "Admin", "email": "admin@example.com",
    "roles": ["ADMIN"], "permissions": ["products.create", "products.view", "…"], "isAdmin": true
  }
}
```

The response status is 201. Wrong credentials give 401 with `code: INVALID_EMAIL_OR_PASSWORD`, and the same answer whether or not the address has an account. Ten attempts a minute are allowed per account.

`deviceName` is an optional third field that names the device.

The token works until `expiresAt`, 15 minutes unless [set otherwise](/guides/authentication/#how-long-a-sign-in-lasts). `refreshToken` gets a new one.

### Keep it going

```sh
curl -X POST http://127.0.0.1:8000/api/auth/refresh \
  -H "Accept: application/json" -H "Content-Type: application/json" \
  -d '{"refreshToken": "kq0…"}'
```

The answer has a new `token`, `expiresAt`, `refreshToken` and `refreshExpiresAt`. Keep the new refresh token and drop the old one, which won't work again: presented later, it is taken as stolen and the sign-in ends. Within a minute of the swap it is a second request that set out at the same moment, and gets a `token` with `"refreshToken": null`; keep the one you have.

A sign-in that has ended answers 401 with a `code`:

| `code` | Why |
|---|---|
| `SESSION_IDLE` | Not refreshed for 7 days. |
| `SESSION_EXPIRED` | 30 days have passed since it began. |
| `SESSION_REPLAYED` | A refresh token that was already swapped was used again. |
| `SESSION_REVOKED` | Signed out, from this device or another, or the account was switched off. |

`refreshExpiresAt` is when the sign-in ends if it isn't refreshed again. It is `null` when there are no limits.

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

That answers 201 with the token. For `email`, ask for the code first with `POST /auth/two-factor/send` and the same `challenge`. The challenge lasts ten minutes and allows five wrong codes. Only the methods the answer listed are accepted, and an authenticator code works once.

An emailed sign-in link or code can get the same answer, when the account has an authenticator app: `methods` then leaves out `email`.

### Every auth endpoint

All are under `/api/auth`. The ones marked 🔒 need a token.

| | Endpoint | Does |
|---|---|---|
| | `GET /config` | Which sign-in methods are switched on. |
| | `POST /token` | Sign in with `email` and `password`. |
| | `POST /refresh` | A new pair for `refreshToken`. See [Keep it going](#keep-it-going). |
| | `POST /two-factor/send`, `/two-factor/verify` | The second step of a password sign-in. |
| | `POST /passkey/options`, `/passkey` | Sign in with a passkey. |
| | `POST /magic-link`, `/magic-link/verify` | Email a sign-in link; sign in with its `token`. |
| | `POST /email-code`, `/email-code/verify` | Email a sign-in code; sign in with `email` and `code`. |
| | `POST /register` | Create an account, when registration is on. |
| | `POST /email/send`, `/email/verify` | Send the verification email; verify with `email` and `code`. |
| | `POST /password/forgot` | Email a way to choose a new password: a link to the dashboard's page, or a 6-digit code with `"method": "code"` (and always where there is no dashboard). Answers `{ sent: true, method }`, the same whether or not the address has an account. |
| | `POST /password/reset` | Set `newPassword`, with the link's `token`, or with `email` and the emailed `code`. A wrong code is `INVALID_OTP`; after a few, `TOO_MANY_ATTEMPTS` (429) and a new one has to be asked for. An address with no account answers the same way, so this can't tell anyone which addresses have one. Every sign-in the account had is ended, and the address counts as proved. |
| | `POST /oauth/{provider}/start`, `/oauth/{provider}/callback` | Sign in with `google` or `github`: where to send the browser, then the code it came back with. See [how it works](/guides/authentication/#google-and-github). |
| 🔒 | `GET /me`, `PATCH /me` | The signed-in user; change `name` or `avatar`. |
| 🔒 | `PUT /avatar?name=me.jpg` | Upload a profile picture. The body is the file, or a form's `file` part, as for any upload. |
| 🔒 | `POST /password` | Change the password: `currentPassword`, `newPassword`. |
| 🔒 | `POST /close` | Close your own account, with `password`. It is kept, and can be [restored](/guides/deleted-accounts/). |
| 🔒 | `GET /sessions`, `DELETE /sessions`, `DELETE /sessions/{id}` | List devices; sign out the others, or one. |
| 🔒 | `POST /two-factor/enable`, `/confirm`, `/disable`, `/backup-codes` | Set up and manage the second step. |
| 🔒 | `GET /passkeys`, `POST /passkeys/options`, `POST /passkeys`, `PATCH`/`DELETE /passkeys/{id}` | List, add, rename and remove passkeys. |
| 🔒 | `GET /social`, `DELETE /social/{id}` | The Google and GitHub accounts connected to yours; disconnect one. |
| 🔒 | `DELETE /token` | Sign out: the sign-in ends, and its tokens stop working. |

An error has a `code` beside its message, such as `INVALID_EMAIL_OR_PASSWORD`, `INVALID_TWO_FACTOR_CODE`, `OTP_EXPIRED`, `TOO_MANY_ATTEMPTS`, or `ACCOUNT_CLOSED` for an account that was closed. A method that is switched off answers 404. Attempts are limited to ten a minute per account, after which the answer is 429.

### Other auth endpoints

| Request | Response |
|---|---|
| `GET /auth/me` | `200 { "user": { id, name, email, role, roles, permissions, isAdmin, emailVerified, twoFactorEnabled, avatar, avatarFile, image }, "session": { id } }`. `role` is the first of `roles`, for code written when an account had one. |
| `DELETE /auth/token` | `204`. The token used for the request stops working. |

## Resource endpoints

Using `products` as the example:

| Request | What it does | Success |
|---|---|---|
| `GET /products` | List records | `200 { data, meta }` |
| `GET /products/{id}` | One record | `200` the record |
| `POST /products` | Create | `201` the record, with a `Location` header |
| `POST /products/_bulk` | Create several | `201 { created, data }` |
| `PATCH /products/{id}` | Change some fields | `200` the record |
| `PUT /products/{id}` | Replace the record | `200` the record |
| `DELETE /products/{id}` | Delete: to [the trash](#the-trash), where it can be restored | `204` |
| `GET /products/_stats` | Counts for dashboards | `200 { total, current, previous, values }` |
| `GET /products/_insights` | Counts per period and per choice, for charts | `200 { total, unit, series, breakdown }` |

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

Keys are camelCase, matching the descriptor. The `id` is a string: a UUID, or digits for a resource with [integer ids](/guides/existing-app/#integer-ids-for-a-new-resource). Dates are `YYYY-MM-DD` and timestamps are ISO 8601.

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
| `filter[field]` | Keep records where the field equals the value. Use `true` or `false` for booleans. An empty value or `null` matches records where an optional field is empty. `text` fields cannot be filtered. For an `enum`, a relation or a whole number, several values separated by commas keep records with any of them: `filter[status]=paid,sent`. |
| `filter[field][operator]` | Keep records that pass the operator, from the table below. Several can be given, and a record has to pass all of them: `filter[price][gt]=10&filter[price][lt]=100`. |
| `include` | `items`: each record with its lines, as on its own page. Only for a resource with [line items](/guides/line-items/). |

| Operator | Fields | Keeps records where the field is |
|---|---|---|
| `in` | `string`, numbers, `enum`, relations | any of the values, separated by commas, at most 100 |
| `gt` | numbers, dates, times | larger, or later |
| `lt` | numbers, dates, times | smaller, or earlier |
| `between` | numbers, dates, times | from the first value to the second, both included: `filter[total][between]=10,50` |
| `contains` | `string` | one that contains the words, in any case |

`createdAt` and `updatedAt` take `gt`, `lt` and `between` too, so `filter[createdAt][gt]=2026-11-01` lists what was made after the 1st of November.

A date given for a time stands for the whole day: `between=2026-11-01,2026-11-30` covers all of the 30th, `gt=2026-11-01` starts at the 2nd, and `lt=2026-11-01` ends before the 1st begins. A time is ISO 8601. Without an offset it is read in the app's timezone (`config/app.php`).

An operator a field can't take, such as `gt` on an `enum`, is refused with 400, and each issue names the parameter.

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

A key that is not a field of the resource is rejected with 422 rather than ignored, so a misspelt field name does not pass unnoticed. `id` and `createdAt` may be included and are ignored.

### When someone else saved first

Send back the `updatedAt` you read with a `PATCH` or `PUT`, and the change is made only if nobody has saved the record since. Otherwise nothing is changed, and the answer is a 409 with the record as it is now:

```json
{
  "error": "Someone else saved this product after you read it, so nothing was changed. Send your change again with the updatedAt it has now.",
  "code": "CHANGED_SINCE_READ",
  "current": { "id": "…", "name": "Lamp", "price": 45, "updatedAt": "2026-10-02T15:20:41.000000Z" }
}
```

Compare `current` with what you read, put your change on top of it, and send it again with its `updatedAt`. The dashboard's edit form does this for you. Leave `updatedAt` out and the change is made whatever happened in between, as it always was.

A change to a record's [lines](/guides/line-items/) is a change to the record: it moves the record's `updatedAt` too. For a record with lines, `current` has them as `items`, because the `items` you send replace the whole list.

### Creating several

```sh
curl -X POST http://127.0.0.1:8000/api/products/_bulk \
  -H "Accept: application/json" -H "Content-Type: application/json" -H "Authorization: Bearer …" \
  -d '{"items": [{"name": "Lamp", "sku": "L-1", "price": 42, "active": true, "kind": "stock"}, {"name": "Desk", "sku": "D-1", "price": 180, "active": true, "kind": "stock"}]}'
```

Every row is checked with the rules for creating one, before anything is written, and they are saved in one transaction. So the answer is all of them (`201 { "created": 2, "data": [ … ] }`), or none and the rows that were wrong:

```json
{
  "error": "Nothing was created: row 2 needs fixing.",
  "rows": [{ "row": 2, "issues": [{ "path": "sku", "message": "The same as row 1. Each one needs its own." }] }]
}
```

Rows are numbered from 1. Two rows of one request can't share a unique value. At most 500 rows a request (`bulk_max` in `config/nevela.php`); for more, import a file from the dashboard. It takes the same permission as creating one.

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

### Insights

```
GET /products/_insights?unit=week&filter[kind]=digital
```

What the dashboard's insights panel is drawn from.

| Part of the answer | What it is |
|---|---|
| `total` | Everything the request matches, whenever it was created. |
| `series` | How many were created in each period, oldest first: `[{ "bucket": "2026-10-05", "count": 3 }, … ]`. A period with nothing in it is there, as zero. |
| `breakdown` | For each enum and yes/no field (the first four), how many records hold each choice: `[{ "field": "kind", "kind": "enum", "slices": [{ "value": "stock", "count": 22 }, … ] }]`. Every choice is listed, in the field's own order. |

`unit` is `day` (the last 30 days, the default), `week` (the last 26 weeks, each called by its Monday) or `month` (the last 12 months, as `2026-10`).

It takes the list's `q` and `filter[…]`, so the counts are of the same records a list request with those parameters returns. `page`, `perPage` and `sort` are accepted and change nothing. It takes the permission to view the resource. Days are counted in the app's timezone (`config/app.php`).

## Shop figures

```
GET /_nevela/shop-figures
```

The shop at a glance: what the top of the dashboard's home and the phone's home show, in an app with a shop. A shop is what the mobile app looks for: an order resource whose [lines](/guides/line-items/) point at what is sold and have a quantity. Without one the answer is 404 with the code `NO_SHOP`.

```json
{
  "orders": { "slug": "orders", "label": "Order", "pluralLabel": "Orders" },
  "today": { "orders": 5, "sameTimeLastWeek": 4 },
  "pending": 2, "pendingStatus": "pending", "statusField": "status",
  "sales": { "total": 128400, "week": 41000, "lastWeek": 36000 },
  "currency": "UGX"
}
```

| Part of the answer | What it is |
|---|---|
| `today` | Orders since midnight, and how many there were last week on the same day up to the same time, not in that whole day. Days are the app's timezone (`config/app.php`). |
| `pending` | Orders still in the status an order starts with: the status field's default, else `pending`, else its first option. The status field is the order's enum called `status`, `state` or `stage`. `null` when it has none. |
| `sales` | The order's money field added up (`total`, `amount` or `grandTotal`, else the first). `week` is the last seven days and `lastWeek` the seven before. Orders whose status starts with "cancel" (`cancelled`, `canceled`) sold nothing and are left out. `null` when orders have no money field. |

It counts the orders this person may see, as their list does, and takes the permission to view orders.

## The trash

A deleted record is kept for 30 days (`trash.days`) and answers 404 everywhere above until it is restored. These are the same for every resource, by its slug:

| Request | What it does | Success |
|---|---|---|
| `GET /_nevela/trash` | How long things are kept, and how many of each resource are deleted | `200 { days, resources }` |
| `GET /_nevela/trash/products` | The deleted products, the latest deletion first. Takes `page` and `perPage`. | `200 { data, meta }` |
| `POST /_nevela/trash/products/{id}/restore` | Put one back | `200 { id, restored }` |
| `DELETE /_nevela/trash/products/{id}` | Remove one for good | `204` |
| `DELETE /_nevela/trash/products?confirm=products` | Remove every deleted product for good | `200 { removed, kept }` |
| `GET /_nevela/trash/_status` | Which resources have a trash the caller may use. Counts nothing. | `200 { days, resources }` |

```json
{
  "data": [
    { "id": "01a0fd2e-…", "label": "Lamp", "deletedAt": "2026-10-09T12:00:00.000000Z", "expiresAt": "2026-11-08T12:00:00.000000Z" }
  ],
  "meta": { "page": 1, "perPage": 25, "total": 1, "totalPages": 1 }
}
```

`label` is the record's title, as a list shows it. `expiresAt` is when it is removed for good, and `null` when `trash.days` is off.

Each takes the permission to delete the resource; a resource the caller may not delete is left out of the first and last, and answers 403 on the rest. A resource whose table has no trash yet answers 404.

| Refusal | Status | `code` |
|---|---|---|
| Restoring a record whose required parent is in the trash too | 409 | `PARENT_IN_TRASH` |
| Removing a record that deleted records still belong to | 409 | `STILL_REFERENCED` |
| Emptying without `confirm` set to the resource's slug | 422 | `CONFIRM` |

Emptying removes what it can and counts the rest in `kept`.

A unique value held by a deleted record is still taken. Creating another with it answers 422, with a message that says the value belongs to a record in the trash.

## Notifications

The dashboard's bell. Each person reads and marks only their own; see [Notifications](/guides/notifications/).

| Request | What it does | Success |
|---|---|---|
| `GET /_nevela/notifications` | The latest 30, newest first, how many are unread, and for an administrator what is wrong with the app | `200 { items, unread, conditions }` |
| `POST /_nevela/notifications/read` | Mark one read (`{ "id": "…" }`), or all of them (no body). Another person's id changes nothing. | `200 { read }` |
| `GET /_nevela/activity` | Who created, changed, deleted, restored or removed for good which records, newest first, on the resources the caller may view. Takes `resource`, `action`, `user`, `page` and `perPage` (at most 100). Needs `activity.view`; 403 without it. | `200 { data, meta }` |

An activity entry is `{ id, action, resource, label, pluralLabel, slug, count, title, recordId, url, user: { id, name }, at, startedAt }`. The same thing done by one person within two minutes is one entry, and `count` is how many times it was done: usually that many records, but deleting the same record twice in that time counts two. `title` and `recordId` are set when the count is one. `url` is where to look when the entry was written: the record, the list, or for a deletion the trash (the list, for someone who may not delete). It is `null` on an entry whose action is `purged`; an older entry's link can lead to a record that has since gone. Before `php nevela migrate` it answers 409 with `code: "MIGRATION_NEEDED"`.

```json
{
  "items": [
    { "id": "019a2f…", "kind": "form.received", "title": "3 new enquiries", "body": null, "url": "/dashboard/enquiries", "tone": "info", "count": 3, "read": false, "at": "2026-10-26T14:05:00+00:00" }
  ],
  "unread": 1,
  "conditions": [
    { "id": "release", "title": "Nevela 0.20.0 is out", "body": "This app is on 0.19.2. Run php nevela upgrade to move to it.", "tone": "info", "url": "https://nevela-docs.vercel.app/reference/changelog/" }
  ]
}
```

`conditions` is always empty for someone who isn't an administrator.

### Push tokens

Where a phone app gets the bell's notices as push notifications. See [Push notifications](/guides/mobile-app/#push-notifications).

| Request | What it does | Success |
|---|---|---|
| `PUT /_nevela/push-tokens` | Register this phone for the caller: `{ "token": "ExponentPushToken[…]", "platform": "android" }`. A phone belongs to whoever registered it last. It is tied to the caller's sign-in, and gets pushes only while that lasts. 422 for something that isn't an Expo push token. 409 for a token that belongs to no sign-in of the app's own (`NO_SESSION`), or one that has ended. Before `php nevela migrate`, 503 with `code: "NOT_MIGRATED"`. | `200 { registered: true }` |
| `DELETE /_nevela/push-tokens/{token}` | Forget this phone, before signing out. Another person's token is left alone. | `200 { registered: false }` |

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

A resource with [line items](/guides/line-items/#in-the-api) sends its lines with one record, as `items`, and takes them back the same way: a line with its `id` is changed, one without is added, and one left out is removed. A mistake in a line is named by its place, `items.1.quantity`.

## Files

| Method | Path | Does |
|---|---|---|
| `PUT` | `/api/_nevela/uploads/{Resource}/{field}?name=kettle.jpg` | Stores a file. The request body is the file itself, or a form's `file` part sent by `POST` with `_method=PUT` (see [Uploading](/guides/images/#uploading)). |
| `GET` | `/api/_nevela/files/{key}` | The stored file. No token needed. |
| `GET` | `/api/_nevela/private/{slug}/{id}/{field}` | A [private file](/guides/images/#private-files), to someone who may view the record. |
| `POST` | `/api/_nevela/private/{slug}/{id}/{field}/link` | `{ path, expiresAt }`: a signed path that opens that private file without a token for five minutes, for a phone's browser. Only for that file: replaced or trashed, it opens nothing. |
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
| 403 | The policy says no: the person's [roles](/guides/policies/) don't include the permission | `{ error }` |
| 404 | No record with that id | `{ error }` |
| 409 | A unique value was taken between validation and saving | `{ error, field }` |
| 409 | Someone else saved the record after the `updatedAt` you sent | `{ error, code: "CHANGED_SINCE_READ", current }` |
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

Needs no token. Returns `{ "nevela": "0.1.3", "app": "3cd733775782" }`: the Nevela version, and a short id for this installation. It is how `nevela status` and the dashboard tell this app's API from another program on the same port.

## Listing the resources

```
GET /_nevela/resources
```

Returns `{ "data": [ … ] }` with every descriptor. Tooling can use it to check that the web app and the API describe the same resources.

## The API as OpenAPI

```
GET /_nevela/openapi.json
```

The API as an [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0) document, written from the descriptors. It covers every resource's endpoints on this page: the list with its sort, search and filters, a record, creating and changing one, deleting it, creating several, stats, insights, its uploads, its actions and its public side. It also covers how to get a token. Each endpoint names the permission it takes, as `x-nevela-permission`.

| For each resource | Schema |
|---|---|
| A record, as the API answers with it: every key it always has, and no other | `Product` |
| What a create takes, with what it requires | `ProductInput` |
| What a `PUT` takes: the same, and `updatedAt` | `ProductReplace` |
| What a `PATCH` takes: any of them | `ProductPatch` |
| What anyone may read of it, signed out | `PublicProduct` |

It needs a token, like `/_nevela/resources`, since it says the same things. To give it to a tool that can't sign in, such as a client generator or a docs site, write it to a file:

```sh
nevela openapi --output=openapi.json
```

The path is from the Laravel app's folder, `apps/api`. Without `--output` the document is printed.

The dashboard shows it as a page to read, **API**, under Manage, for administrators. It has the same file to download.

The document is made by the same rules as the generated code, and Nevela's tests send real requests to a generated app and hold every answer to it. A record's schema lists every key, so a response with a key missing or one added fails them.

## Adding your own routes

`routes/nevela.php` is loaded under the same prefix and middleware. Add routes below its generated block and they get the token check and the same error format:

```php
// nevela:generated:end

Route::post('products/{product}/archive', [ProductController::class, 'archive']);
```
