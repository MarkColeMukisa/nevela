---
title: "The trash"
description: "A deleted record is kept for 30 days and can be restored: the Trash page, Undo, who may use it, and what it changes in your own code."
---

Deleting a record doesn't remove it. It goes to the trash, where it is kept for 30 days and can be restored. After that it is removed for good.

Every resource has this. There is nothing to switch on.

## What deleting does

While a record is in the trash it is hidden everywhere a person looks: lists, counts, stats, insights, exports, search and its own page. Over the API, `GET /products/{id}` answers 404 for it.

In the dashboard, every delete says so before it happens ("Move this product to the trash? It can be restored from the trash for 30 days.") and afterwards offers **Undo** in the message that confirms it. Deleting several rows at once gives one Undo for all of them.

## The Trash page

**Trash**, under Manage in the sidebar, lists what has been deleted, one tab per resource with a count on each.

| | |
|---|---|
| **Restore** | The record goes back into its list as it was. |
| **Delete forever** | It is removed for good, now. It asks first. |
| **Empty** | Everything of that resource in the trash is removed for good. It asks first, and says how many. |

Each row shows when the record was deleted and how long it has left.

## Who may use it

Whoever may delete a resource's records may restore them and remove them for good. Someone with `products.delete` and nothing else sees deleted products in the trash, and no other tab. Someone who may delete nothing has no Trash link.

A generated policy has a method for each, `restore` and `forceDelete`, and both ask for the resource's `delete` permission. Change them to make the rule stricter, for example so that only an administrator removes anything for good:

```php
use Nevela\Laravel\Access\Access;

public function forceDelete(User $user, Product $product): bool
{
    return Access::isAdmin($user);
}
```

The Trash page shows a resource to anyone who may delete, restore or remove its records. So with the rule above, the people who delete still see what they deleted and can restore it; only Delete forever refuses them.

A policy you wrote before 0.6.0 has neither method. It is asked what it says to `delete` instead, so it keeps working unchanged.

## How long things are kept

Thirty days. To change it, [publish the config](/guides/configuration/) and set `trash.days`:

```php
'trash' => ['days' => 90],
```

Set it to `null` and deleted records are kept until someone removes them from the Trash page.

What is past its time is removed:

- each night at 03:40, where the app's scheduler is running. That is Laravel's one cron line, `* * * * * php artisan schedule:run`, which a server needs for any scheduled work;
- whenever someone opens the Trash page, so nothing outstays its time on a server with no scheduler;
- when you run `nevela trash`.

## A value that must be unique

A record in the trash still holds its unique values, because restoring it has to be possible. Create a product with the SKU of a deleted one and the form says why:

> This belongs to a record in the trash. Restore that record, or delete it for good to use the value again.

## Records that belong to each other

- A category that still has products can't be deleted, as before.
- A product in the trash doesn't count. With its last product deleted, the category can be deleted too.
- That product can't be restored while its category is in the trash: restore the category first. The message says so.
- A category can't be removed for good while a deleted product still belongs to it. Remove the product for good first. **Empty** leaves such records in place and says how many it kept.

## In your Laravel code

It is Laravel's own soft delete, so everything you know about it applies:

```php
Product::query()->count();                 // without what is in the trash
Product::withTrashed()->count();           // with it
Product::onlyTrashed()->get();             // only what is in the trash

$product->delete();                        // to the trash
$product->restore();
$product->forceDelete();                   // for good
$product->trashed();                       // true while it is in the trash
```

A query that doesn't go through the model sees every row. `DB::table('products')->count()` counts what is in the trash too; add `->whereNull('deleted_at')` to one of your own that should not.

A resource deletes for good when its table has no `deleted_at` column. To have one resource without a trash, drop the column in a migration of your own:

```php
Schema::table('audit_entries', fn (Blueprint $table) => $table->dropSoftDeletes());
```

## Upgrading an app from before 0.6.0

```sh
nevela upgrade
nevela migrate
```

`nevela upgrade` writes a migration for each resource you already have, `add_trash_to_products_table`, which adds the column. `nevela migrate` runs them.

Between the two, the app works as it did: a table that has not been migrated yet has no trash, its Delete button says "This can't be undone", and that is true. Each resource gets its trash when its migration runs.

Two things to check afterwards:

- Queries of your own that read a resource's table with `DB::table(…)`, as above.
- A unique value freed by deleting a record is now freed when the record is removed for good, 30 days later or by hand.

## Over the API

See [The trash](/reference/api/#the-trash) in the API reference.
