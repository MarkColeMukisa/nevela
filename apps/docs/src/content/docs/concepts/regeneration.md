---
title: "Regeneration and your code"
description: "How to change a resource, and how Nevela keeps the code you wrote."
---

## Changing a resource

1. Edit the descriptor, for example add `"featured": { "kind": "boolean" }` to `fields`.
2. Run `php artisan nevela:generate`.
3. Write a migration for the database change. Nevela does not write one for you after the first: `php artisan make:migration add_featured_to_products`.
4. Run `php artisan migrate`.

### Your code is kept

Generated code sits between two marker comments:

```php
// nevela:generated:start hash=4f1c2a9b7e31
protected $fillable = ['name', 'sku', 'price'];
// nevela:generated:end

// Your own relationships, scopes and accessors go here.
```

Regeneration rewrites only what is between the markers. Anything outside them is never touched.

If you edit *inside* the markers, Nevela notices, because the hash no longer matches the content. It skips that file and tells you:

```
app/Models/Product.php .. skipped — edited inside generated block
```

Move your change outside the markers and run the command again, or use `--force` to overwrite it.

Files marked "written once" above belong to you after they are created. Regeneration never changes them.
