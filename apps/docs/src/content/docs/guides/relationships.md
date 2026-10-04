---
title: "Relationships"
description: "Link one resource to another with belongsTo, and what Nevela generates on both ends."
---

A `belongsTo` field links a record to one record of another resource: a product to its category, a task to its owner.

```sh
php nevela resource Product --fields="name:string, category:belongsTo(Category)"
```

The resource it points at has to exist first. If it does not, nothing is written and you are told the command to create it.

## How to write it

| You write | Field | Column | Points at |
|---|---|---|---|
| `category:belongsTo(Category)` | `categoryId` | `category_id` | Category |
| `category:belongsTo` | `categoryId` | `category_id` | Category, from the name |
| `owner:belongsTo(Member)` | `ownerId` | `owner_id` | Member |
| `category:belongsTo(Category)?` | `categoryId` | `category_id`, nullable | Category, or nothing |

The field's name always ends in `Id`, because an id is what it holds. `category` and `categoryId` mean the same field.

## What is generated

On the resource that has the field (Product):

- **Migration:** `category_id`, a foreign key to `categories`, indexed.
- **Validation:** the id has to be a category that exists.
- **Model:** `$product->category`.
- **Dashboard:** a picker that searches categories by name, the category's name in the table, and a link to it on the product's page.

On the resource it points at (Category):

- **Model:** `$category->products`.
- **Dashboard:** the category's page lists its products.
- **Deleting:** see below.

Both models are regenerated when the relation is added, inside their generated blocks. Relations you write yourself go outside the block and are never touched.

```php
$category->products()->where('active', true)->count();
Product::with('category')->get();
```

## Deleting

What happens to the children when the parent is deleted depends on whether the link is required.

| The field is | Deleting the parent |
|---|---|
| required: `category:belongsTo(Category)` | is refused while it has children. The API answers 409 with "8 products belong to this category. Move or delete them first." |
| optional: `category:belongsTo(Category)?` | is allowed. Its children stay, with the link cleared. |

## In the API

The field is an id in both directions:

```json
{ "name": "Smart Kettle", "categoryId": "01a10804-7b04-72d6-aabf-a2113b9b6bc5" }
```

Filter a list by it:

```
GET /api/products?filter[categoryId]=01a10804-7b04-72d6-aabf-a2113b9b6bc5
```

## More than one link to the same resource

A task with an owner and a reviewer, both members:

```sh
php nevela resource Task --fields="title:string, owner:belongsTo(Member), reviewer:belongsTo(Member)?"
```

Member gets two relations, named so they do not collide: `tasks` for the first field and `tasksAsReviewer` for the second.

## Seeding

`php nevela seed Product` gives each product a category picked from the ones that exist. Seed the parent first; if there are none and the link is required, the command says so and stops.

## Not generated

- Many-to-many (a product in several categories). Create a resource for the link itself, with a `belongsTo` to each side.
- A relation added to a resource whose table already exists. The migration is written once, so add the column in a migration of your own: `$table->foreignUuid('category_id')->constrained('categories');`
