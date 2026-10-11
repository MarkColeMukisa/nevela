---
title: "Adding Nevela to an app you already have"
description: "Make resources of tables that are already there, with the ids they already have: nevela adopt, integer ids, and what is left alone."
---

An app that had its tables before it had Nevela doesn't have to give them up. `nevela adopt` reads a table and writes the descriptor for it, and everything else is generated from that as for any resource. The table is not changed.

```sh
nevela adopt posts
```

The tables have to be in the database Nevela's Laravel app (`apps/api`) is connected to. How they come to be there is yours to decide: the database the old app uses, or a copy of it. Try it on a copy first.

## What a table needs

| | |
|---|---|
| A primary key that is one column called `id` | Integers (`$table->id()`) or UUIDs. |
| `created_at` and `updated_at` | Lists are sorted by them and the dashboard's counts are made from them. |

A table without them is refused, with the reason. Add the timestamps with a migration of your own (`$table->timestamps()`) and adopt it then.

## Adopting a table

```sh
nevela adopt transactions
```

```
  transactions as Transaction, with integer ids.

  internship_application_id ... internshipApplicationId:belongsTo(InternshipApplication)?
  reference .................................................... reference:string!
  amount ............................................................. amount:int
  status .......................................................... status:string
  gateway_response ......................... left alone: json has no field kind
```

It shows what it read, in the words you would write after `--fields`, and asks before it writes anything. Say no and nothing is written. `--yes` skips the question.

Then it writes `nevela/resources/transaction.json` and generates the model, the request, the API resource, the controller, the policy and the dashboard pages. It writes no migration that creates the table.

| Option | Meaning |
|---|---|
| `--name=` | The resource's name, when it isn't the table's own. `posts` is `Post` unless you say otherwise. |
| `--icon=`, `--group=` | As for [`nevela resource`](/reference/commands/#nevela-resource). |
| `--yes` | Write it without asking. |
| `--force` | Read the table again and replace the descriptor it already has. |

## How columns are read

| Column | Field |
|---|---|
| `varchar`, `char` | `string`, with the column's own length when that isn't 255 |
| `text`, `mediumtext`, `longtext` | `text`, as long as the column allows |
| integers | `int` |
| `tinyint(1)`, `boolean` | `boolean` |
| `decimal`, `float`, `double` | `float` |
| `date` | `date` |
| `datetime`, `timestamp` | `datetime` |
| a MySQL `enum` | `enum`, with its values |
| a foreign key to the `id` of a table that is a resource | `belongsTo` |
| nullable | optional (`?`) |
| a unique index on the one column | unique (`!`) |

Every column comes in as the plainest type that holds it. An `email` column is a `string`, not an `email`, because each value in it was valid when it was saved and a stricter rule would refuse to save an old record again. Where you know a column is an email, a slug, a URL or one of a few choices, say so in the descriptor and run `nevela generate`:

```json
"email": { "kind": "string", "format": "email" },
"status": { "kind": "enum", "options": ["pending", "successful", "failed"] }
```

The same goes for length. A `varchar(500)` is adopted as `string(500)`, so a value that fit the column is not refused by the form.

## Adopt parents first

A foreign key becomes a relation when the table it points at is already a resource. So adopt the table that is pointed at first:

```sh
nevela adopt internship_applications
nevela adopt transactions        # internship_application_id is now a relation
```

The other way round, the column is adopted as a plain number and the command says why. Adopt the parent, then run `nevela adopt transactions --force` to read the table again.

The relation's column has to end in `_id`. One that doesn't stays a plain value.

## What is left alone

A column with no field kind (`json`, a binary column, a `time`) is not in the descriptor. It stays in the table as it is: the API doesn't send it, doesn't accept it and doesn't touch it when a record is saved. Your own code can go on using it.

So does a column that looks like a secret (`password`, `remember_token`, anything ending in `_token` or `_secret`). Add it to the descriptor by hand if it should be there.

One case needs attention, and the command points it out: a column that is left out, has to have a value and has no default. Creating a record from the dashboard would fail on it. Give the column a default or make it nullable.

## Then

```sh
nevela migrate
```

This gives each adopted table a `deleted_at` column, so that deleting a record puts it in [the trash](/guides/trash/). Until it has run, a delete removes the record, as it did before.

:::caution[A table that already has deleted_at]
If your app soft-deletes already, the rows it marked as deleted are in Nevela's trash from the start, and the trash removes for good whatever has been in it longer than `trash.days` (30). It does that each night, and whenever someone opens the Trash page. To keep those rows, set `trash.days` to `null` in `config/nevela.php` before you adopt the table. The command reminds you.
:::

Then look at the generated policy, `app/Policies/<Name>Policy.php`. It asks for the resource's [permissions](/guides/policies/), which an administrator has and nobody else does until given them.

## When the name is taken

If your app already has `app/Models/Post.php`, Nevela won't write over it and the command stops. Adopt the table under another name:

```sh
nevela adopt posts --name=Article
```

That gives an `Article` resource on the `posts` table, beside your `Post` model. Or move your model aside, adopt, and bring what was yours back into the generated model, outside its generated block.

## Files

A column that holds a file's path (`cv_path`, `thumbnail`) is adopted as a `string`. Its values are paths on your own disk, not the keys Nevela gives to [files it stored](/guides/images/), so it can't be turned into a `file` or `image` field as it is: the old values would be refused.

## Integer ids for a new resource

A resource Nevela creates has UUID ids. To have the numbered ids of `$table->id()` instead, say so when you make it:

```sh
nevela resource Note --fields="body:text, post:belongsTo(Post)" --id=int
```

The two kinds can point at each other. A relation's column follows the resource it points at: a `foreignId` to a resource with integer ids, a `foreignUuid` to one with UUIDs.

Whichever a resource has, its `id` is a string in the API (`"id": "42"`), and so is a relation's. The dashboard never needs to know which it is.

The kind of id is chosen when the resource is made. Changing it afterwards means migrating the table and everything that points at it yourself.
