---
title: "Field types"
description: "Every field type Nevela accepts, how it is stored, and how it is validated."
---

Fields are written as `name:type`, separated by commas:

```sh
php artisan nevela:resource Product --fields="name:string, sku:string!, price:money, notes:text?"
```

## Suffixes

| Suffix | Meaning | Example |
|---|---|---|
| `?` | Optional. The column is nullable. | `notes:text?` |
| `!` | Unique. No two records share a value. | `sku:string!` |

Both can be combined: `code:string?!`.

## Types


| Type | Stored as | Validation |
|---|---|---|
| `string` | `string` | text, up to 255 characters |
| `text` | `text` | text, up to 65,535 characters |
| `email` | `string` | a valid email address |
| `url` | `string` (2,048) | a valid URL |
| `tel` | `string` | text, up to 32 characters |
| `slug` | `string` | letters, numbers, dashes and underscores |
| `color` | `string` | a hex colour such as `#1a2b3c` |
| `int` | `integer` | a whole number |
| `float` | `double` | a number |
| `money` | `decimal(12, 2)` | a number |
| `percent` | `double` | a number from 0 to 100 |
| `rating` | `integer` | a whole number |
| `boolean` | `boolean` | true or false |
| `date` | `date` | a date as `YYYY-MM-DD` |
| `datetime` | `dateTime` | a date and time |
| `enum(a\|b\|c)` | `string`, indexed | one of the listed values |

The dashboard picks the input and the table column from the type.

`integer`, `bool` and `decimal` are accepted as other spellings of `int`, `boolean` and `money`.

Every resource also has `id` (a UUID), `createdAt` and `updatedAt`. You do not declare them, and those names are reserved.
