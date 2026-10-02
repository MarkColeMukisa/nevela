---
title: "Seeding data"
description: "Fill a resource with plausible records in one command, and see how long it took."
---

Fill a resource with plausible records, and print how long it took.

```sh
php artisan nevela:seed Product --count=1000
```

```
 INFO  Seeded 1,000 Products in 114 ms (8,809 rows/s).

  Products in the database ........................................ 1,000
```

| Argument or option | Meaning |
|---|---|
| `name` | The resource to fill. |
| `--count=` | How many records to create. Default 1,000, at most 5,000,000. |
| `--chunk=` | Rows per insert statement. Default 500. Lowered automatically for wide tables. |
| `--fresh` | Delete the resource's existing records first. |

How the values are chosen:

- They follow the descriptor: enum fields use their options, money has two decimals, percents stay between 0 and 100.
- A field's name is used as a hint, so `email`, `phone`, `city`, `company` and `sku` look like what they are.
- Optional fields are left empty about one time in five.
- Creation dates are spread over the last 60 days, so the dashboard's weekly numbers and trends have something to show.

What to know before using it:

- **Unique fields stay unique**, including when you run the command several times.
- **A unique field with few possible values limits the count.** A unique `enum(a|b|c)` can only fill three rows. The command refuses a larger `--count` and says how much room is left.
- **It is all or nothing.** The delete from `--fresh` and all the inserts share one transaction. If anything fails, the table is left as it was.
- **Rows are inserted directly.** That is what makes it fast. It also means the form request, the policy and model events do not run. Use it for development and demo data, not for importing real records.
