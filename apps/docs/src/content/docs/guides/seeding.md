---
title: "Seeding data"
description: "Fill a resource with plausible records in one command, and see how long it took."
---

Fill a resource with plausible records, and print how long it took.

```sh
nevela seed Product --count=1000
```

`--count` is how many the table should hold, not how many to add, so it seeds what is missing. Run the same command again and it says so and does nothing:

```
 INFO  1,000 Products are there, and you asked for 1,000. Nothing to seed.
```

That makes it safe to stop. Press Ctrl+C halfway through, run the command again, and it carries on to exactly the number you asked for. Records in [the trash](/guides/trash/) don't count, as the list doesn't show them. It never removes any to reach the number: `--fresh` does that.

To seed a resource at the moment you create it, add `--seed` to the resource command: `nevela resource Product --fields="name:string" --seed=100`.

```
 INFO  Seeded 1,000 Products in 114 ms (8,809 rows/s).

  Products in the database ........................................ 1,000
```

| Argument or option | Meaning |
|---|---|
| `name` | The resource to fill. |
| `--count=` | How many records the table should hold. Default 1,000, at most 5,000,000. |
| `--chunk=` | Rows per insert statement. Default 500. Lowered automatically for wide tables. |
| `--fresh` | Delete the resource's existing records first, and seed that many. |

How the values are chosen:

- They follow the descriptor: enum fields use their options, money has two decimals, percents stay between 0 and 100.
- A field's name is used as a hint, so `email`, `phone`, `city`, `company` and `sku` look like what they are.
- Optional fields are left empty about one time in five.
- A `belongsTo` field is given a record that exists, picked at random. Seed the resource it points at first.
- An image field is given one of a few placeholder pictures made for the run. They go through the same optimiser as an upload, so their renditions exist too. This is the slow part: about a quarter of a second per picture, six per image field.
- A resource called Category, Collection, Department, Tag, Genre or Brand gets names like Kitchen and Outdoor.
- Creation dates are spread over the last 60 days, so the dashboard's weekly numbers and trends have something to show.

What to know before using it:

- **Unique fields stay unique**, including when you run the command several times. A numbered field goes on from the last number given, and the others can start from a large number on a table that already has records.
- **A unique field with few possible values limits the count.** A unique `enum(a|b|c)` can only fill three rows. The command refuses a larger `--count` and says how much room is left.
- **It saves as it goes.** Rows are saved 5,000 at a time, so stopping loses at most that many, and running it again fills them in. With `--fresh` it is all or nothing: the delete and every insert share one transaction, and if anything fails, the table is left as it was.
- **Rows are inserted directly.** That is what makes it fast. It also means the form request, the policy and model events do not run. Use it for development and demo data, not for importing real records.
