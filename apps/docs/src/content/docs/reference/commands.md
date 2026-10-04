---
title: "Commands"
description: "Every Nevela command and option: resource, generate, seed, user, update, dev, status and version."
---

Run Nevela's commands from the top of your project with `php nevela`:

```sh
php nevela dev                       # run the API and the dashboard
php nevela status                    # check the app
php nevela resource Product --fields="name:string, price:money" --seed
php nevela generate
php nevela seed Product
php nevela user
php nevela update
php nevela version
```

Each one is an artisan command underneath, and this page documents them under those names: `php nevela seed Product` is `php artisan nevela:seed Product`, run in `apps/api`. Use whichever you prefer. [The launcher](#the-php-nevela-launcher) at the end of this page lists what else `php nevela` does.

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
| `--migrate` | Run the new migration straight away. `php nevela resource` always does. |
| `--seed`, `--seed=100` | Fill the new resource with records as well: 25, or the number you give. Runs the migration first. |

It writes the descriptor to `nevela/resources/<name>.json`, then generates the files listed in [What gets generated](/concepts/resources/#what-gets-generated). Run `php artisan migrate` afterwards, or pass `--migrate`.

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

## nevela:update

Bring the app up to the latest Nevela: the package, the generated code and the dashboard.

```sh
php artisan nevela:update
php artisan nevela:update --check    # show what would change, and change nothing
```

| Option | Meaning |
|---|---|
| `--check` | Show what would change, and change nothing. |
| `--skip-package` | Leave `nevela/laravel` as it is. Regenerate and update the dashboard only. |

Dashboard files you have not changed are updated; files you changed are kept and listed. [Updating](/guides/updating/) explains each step and what to do on the first update.

## nevela:dev

Run the API and the dashboard together.

```sh
php nevela dev
```

```
  API ............................................. http://127.0.0.1:8000
  Dashboard ............................... http://localhost:3000/sign-in
```

It checks the API's port before using it. If another program already has port 8000, it moves to the next free one, says so, and starts the dashboard pointed at that address. This matters most on Windows, where two programs can listen on the same port and the older one gets the requests: without the check, the dashboard would be talking to someone else's app.

| Option | Meaning |
|---|---|
| `--port=` | The first port to try for the API. Default 8000. |
| `--api-only` | Start the API without the dashboard. |

Stopping it with Ctrl+C stops both.

## nevela:status

Check the app.

```sh
php nevela status
```

```
  Nevela ................................................ 0.1.3 (latest)
  Laravel / PHP ....................................... 13.34.0 / 8.5.11
  Database ............................ sqlite · database/database.sqlite
  Migrations ...................................... 5 ran, none pending
  Users who can sign in ................................................ 1
  Resource: Product ....................................... 1,000 records
  Dashboard ................................................ template 0.1.3
  API ............. http://127.0.0.1:8000/api (running, and it is this app)

  Everything looks right.
```

Anything that needs attention is in red, with the command that fixes it: migrations that have not run, a resource whose table is missing, nobody able to sign in, or the dashboard's API address being answered by a different program. The command exits with an error code when it finds a problem, so it works in scripts.

## nevela:version

```sh
php nevela version
```

Prints the version of Nevela the app is on, for example `Nevela 0.1.3`. `php nevela --version` does the same.

## The php nevela launcher

`nevela` is a small PHP file at the top of your project. It saves the `cd apps/api`, and it hands your command to artisan in the same process, so arguments arrive exactly as you typed them.

| You type | It runs |
|---|---|
| `php nevela dev` | `php artisan nevela:dev` |
| `php nevela status` | `php artisan nevela:status` |
| `php nevela version` | `php artisan nevela:version` |
| `php nevela resource …` | `php artisan nevela:resource … --migrate` |
| `php nevela generate` | `php artisan nevela:generate` |
| `php nevela seed …` | `php artisan nevela:seed …` |
| `php nevela user` | `php artisan nevela:user` |
| `php nevela update` | `php artisan nevela:update` |
| `php nevela migrate` | `php artisan migrate` |
| `php nevela artisan <command>` | any other artisan command, for example `php nevela artisan route:list` |
| `php nevela` | the list of commands |

`php nevela resource` creates the table as well, because a new resource is no use without it. Pass `--no-migrate` to skip that.

The file is written by `nevela:generate` and kept up to date by it. Add your own shortcuts below its generated block.

It is created when the Laravel app sits at `<project>/apps/<name>`, which is how `pnpm create nevela` lays a project out. For another layout, set `root_path` in `config/nevela.php`.
