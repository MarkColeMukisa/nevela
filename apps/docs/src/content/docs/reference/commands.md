---
title: "Commands"
description: "nevela:resource, nevela:generate, nevela:seed and nevela:user, with every option."
---

Nevela adds four commands to `php artisan`. Run them in the Laravel app (`apps/api`).

To create a new app in the first place, see the [quickstart](/start/quickstart/): `pnpm create nevela my-app`.

## nevela:resource

Describe a new resource and generate everything for it.

```sh
php artisan nevela:resource Product --fields="name:string, price:money, kind:enum(stock|digital)" --icon=package --group=Catalogue
```

| Argument or option | Meaning |
|---|---|
| `name` | The resource name, PascalCase and singular. |
| `--fields=` | The fields, as `name:type` separated by commas. See [field types](/concepts/field-types/). If left out, the command asks for them. |
| `--icon=` | A Lucide icon name for the dashboard sidebar. |
| `--group=` | The sidebar heading to put the resource under. |
| `--force` | Replace the descriptor if the resource already exists. |

It writes the descriptor to `nevela/resources/<name>.json`, then generates the files listed in [What gets generated](/concepts/resources/#what-gets-generated). Run `php artisan migrate` afterwards.

If the resource already exists, the command stops and points you at `nevela:generate`, so a typo cannot wipe out an existing descriptor.

## nevela:generate

Regenerate code from the descriptors. Run it after editing a descriptor.

```sh
php artisan nevela:generate            # every resource
php artisan nevela:generate Product    # one resource
```

| Argument or option | Meaning |
|---|---|
| `name` | Only this resource. Leave out for all of them. |
| `--force` | Overwrite generated blocks even where you edited inside them. |

Each file is reported with what happened to it:

| Status | Meaning |
|---|---|
| `created` | The file did not exist and was written. |
| `updated` | The generated block changed and was rewritten. |
| `unchanged` | Nothing to do. |
| `exists (yours)` | A written-once file (migration, policy, dashboard page) that is already there. |
| `skipped — edited inside generated block` | You changed code between the markers. Move it out, or use `--force`. |
| `skipped (no web app at nevela.web_path yet)` | The web app folder was not found, so web files were not written. |

## nevela:seed

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

## nevela:user

Create someone who can sign in to the dashboard.

```sh
php artisan nevela:user
```

It asks for a name, an email and a password. The password is not shown as you type.

| Option | Meaning |
|---|---|
| `--name=` | The person's name. |
| `--email=` | The address they sign in with. Must not be in use already. |
| `--password=` | Their password, at least 8 characters. Leave it out to be asked for it, which keeps it out of your shell history. |

Pass all three to create a user without being asked anything, for example in a deploy script:

```sh
php artisan nevela:user --name="Ada Okafor" --email=ada@example.com --password="$ADMIN_PASSWORD"
```
