---
title: "Resources"
description: "What a resource is, how to describe one, and what Nevela generates from it."
---

## Describing a resource

```sh
nevela resource Product --fields="name:string, sku:string!, price:money, active:boolean, kind:enum(stock|digital), notes:text?"
```

The name is PascalCase and singular (`Product`, `BlogPost`). Fields are `name:type`, separated by commas. Field names are camelCase.

Two suffixes change a field:

| Suffix | Meaning | Example |
|---|---|---|
| `?` | Optional. The column is nullable. | `notes:text?` |
| `!` | Unique. No two records share a value. | `sku:string!` |

Both can be combined: `code:string?!`.

The full list of types is on the [field types](/concepts/field-types/) page.

## What gets generated

In the Laravel app:

| File | Regenerated? |
|---|---|
| `nevela/resources/product.json`, the descriptor | It is the input. You edit it. |
| `app/Models/Product.php` | Between the markers |
| `app/Http/Requests/Nevela/ProductRequest.php` | Between the markers |
| `app/Http/Resources/Nevela/ProductResource.php` | Between the markers |
| `app/Http/Controllers/Api/ProductController.php` | Between the markers |
| `routes/nevela.php` | Between the markers |
| `database/migrations/…_create_products_table.php` | Written once |
| `app/Policies/ProductPolicy.php` | Written once |

In the web app:

| File | Regenerated? |
|---|---|
| `resources/product.resource.ts`, the dashboard's description of the resource | Between the markers |
| `resources/index.ts`, the list of all resources | Between the markers |
| `app/dashboard/products/…`, the list, new, detail and edit pages | Written once |


## Next

- [Field types](/concepts/field-types/): every type and how it is stored and validated
- [The resource descriptor](/concepts/descriptor/): the JSON file everything is generated from
- [Regeneration and your code](/concepts/regeneration/): changing a resource without losing your edits
- [Roles and policies](/guides/policies/): who may do what
