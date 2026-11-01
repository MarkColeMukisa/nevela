---
title: "Regeneration and your code"
description: "How to change a resource, and how Nevela keeps the code you wrote."
---

## Changing a resource

**To add a field**, one command does all of it, the migration too:

```sh
nevela field Product featured:boolean
```

See [`nevela field`](/reference/commands/#nevela-field).

**To change a field**, or anything else in a descriptor:

1. Edit the descriptor, for example give a field a `"default"`.
2. Run `nevela generate`.
3. If the database has to change as well, write a migration for it. Nevela writes one for a new table and a new field, and leaves changes to a column that has your data in it to you: `nevela artisan make:migration make_sku_longer_on_products`.
4. Run `nevela migrate`.

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

Files that are "written once" in [what gets generated](/concepts/resources/#what-gets-generated), such as the policy, the migration and the dashboard pages, belong to you after they are created. Regeneration never changes them.
