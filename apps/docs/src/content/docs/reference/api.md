---
title: "REST API"
description: "Every endpoint, the query parameters, and the error responses."
---

Every resource gets the same set of endpoints. They follow the format Flare's client expects, so the dashboard works against them unchanged, and you can call them from anything else that speaks HTTP.

All paths below are under the prefix `/api`. Send `Accept: application/json` on every request.

## Signing in

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
