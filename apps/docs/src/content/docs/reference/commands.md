---
title: "Commands"
description: "Every nevela command and option: new, update, resource, generate, seed, user, upgrade, dev, status and --version."
---

Install the `nevela` command once, and everything is this short, in every shell:

```sh
npm install -g create-nevela
```

Anywhere:

```sh
nevela new my-app          # create an app
nevela update              # update the nevela command itself
nevela --version           # which version it is
nevela                     # everything it can do
```

Inside an app, from any folder in it:

```sh
nevela dev                 # run the API and the dashboard
nevela status              # check the app
nevela resource Product --fields="name:string, price:money" --seed
nevela generate
nevela seed Product
nevela user
nevela upgrade             # bring the app to the latest Nevela
nevela migrate
```

You don't have to install it. [Without the nevela command](#without-the-nevela-command), at the end of this page, has the longer forms that do the same.

## nevela new

Create an app: a Laravel API in `apps/api` and the dashboard in `apps/web`.

```sh
nevela new my-app
```

Leave the name off and it asks for one. The [quickstart](/start/quickstart/) walks through what it does.

| Option | Meaning |
|---|---|
| `--pm <pnpm\|npm\|yarn\|bun>` | Package manager for the dashboard. Default: pnpm when you have it, and npm otherwise. |
| `--no-install` | Don't install the dashboard's dependencies. |
| `--fast` | Leave out PHPUnit, Pint and Laravel's other development packages. About a third quicker. |
| `--no-user` | Don't create the starter account, or the sample users. |
| `--no-sample-users` | Create the administrator only, without the ten sample users. |
| `--no-git` | Don't run `git init`. |
| `--bundled-package` | Use the copy of `nevela/laravel` inside the installer instead of the release on Packagist. |
| `-y`, `--yes` | Ask nothing. Only the app name is ever asked for, and only if you leave it off. |

## nevela update

Update the `nevela` command itself. It does not touch any app.

```sh
nevela update
```

It asks the package manager that installed the command for the newest version, then asks the command for its version to make sure. See [Updating and upgrading](/guides/updating/).

## nevela --version

```sh
nevela --version
```

```
  Nevela command   v0.5.0  installed with npm
  This app         v0.5.0
```

The first line is the command on your computer. The second is the app you are in, and is left out anywhere else. `nevela version` does the same.

When its output is piped or captured, it prints the number alone (`0.5.0`), for scripts.

## nevela resource

Describe a new resource and generate everything for it.

```sh
nevela resource Product --fields="name:string, price:money, kind:enum(stock|digital)" --icon=package --group=Catalogue
```

| Argument or option | Meaning |
|---|---|
| `name` | The resource name, PascalCase and singular. |
| `--fields=` | The fields, as `name:type` separated by commas. See [field types](/concepts/field-types/), including `category:belongsTo(Category)` and `image:image`. If left out, the command asks for them. |
| `--icon=` | A Lucide icon name for the dashboard sidebar. |
| `--group=` | The sidebar heading to put the resource under. |
| `--force` | Replace the descriptor if the resource already exists. |
| `--no-migrate` | Don't create the table yet. Run `nevela migrate` when you are ready. |
| `--seed`, `--seed=100` | Fill the new resource with records as well: 25, or the number you give. |

It writes the descriptor to `nevela/resources/<name>.json`, generates the files listed in [What gets generated](/concepts/resources/#what-gets-generated), and creates the table, because a new resource is no use without it.

If the resource already exists, the command stops and points you at `nevela generate`, so a typo cannot wipe out an existing descriptor.

## nevela generate

Regenerate code from the descriptors. Run it after editing a descriptor.

```sh
nevela generate            # every resource
nevela generate Product    # one resource
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

## nevela seed

Fill a resource with plausible records, and print how long it took.

```sh
nevela seed Product --count=1000
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

## nevela user

Create someone who can sign in to the dashboard.

```sh
nevela user
```

It asks for a name, an email, a password and a role. The password is not shown as you type.

| Option | Meaning |
|---|---|
| `--name=` | The person's name. |
| `--email=` | The address they sign in with. Must not be in use already. |
| `--password=` | Their password, at least 8 characters. Leave it out to be asked for it, which keeps it out of your shell history. |
| `--role=` | Their [role](/guides/policies/): `ADMIN`, `EDITOR`, `USER` or one you have made. |
| `--sample` | Create the ten sample users instead: two editors and eight users, one switched off. Their password is `password`, or `--password`. Refused in production. |

The first account in an app is its `ADMIN`, whatever `--role` is left out. After that, an account made without `--role` and without being asked is a `USER`, which allows nothing beyond its own account.

Pass the options to create a user without being asked anything. On a server, where the `nevela` command usually isn't installed, use the artisan form:

```sh
php artisan nevela:user --name="Ada Okafor" --email=ada@example.com --password="$ADMIN_PASSWORD" --role=ADMIN
```

## nevela upgrade

Bring the app up to the latest Nevela: the package, the generated code and the dashboard.

```sh
nevela upgrade
nevela upgrade --check    # show what would change, and change nothing
nevela upgrade --undo     # put the dashboard back as it was before the last upgrade
```

It opens with the version the app is on. After an upgrade that worked, it ends with the version the app is on now; `--check` and `--undo` leave that line out.

`nevela update` and `nevela upgrade` are two commands, as in Grit: `update` is for the `nevela` command itself, and `upgrade` is for the app you are in. See [Updating and upgrading](/guides/updating/).

| Option | Meaning |
|---|---|
| `--check` | Show what would change, and change nothing. |
| `--undo` | Restore the files the last upgrade replaced, from its backup. |
| `--skip-package` | Leave `nevela/laravel` as it is. Regenerate and update the dashboard only. |

Dashboard files you have not changed are updated, after being backed up. Files you changed are kept, and the new versions are saved beside them to compare. [Updating](/guides/updating/) explains the record that makes this exact, and what to do with an older app.

## nevela dev

Run the API and the dashboard together.

```sh
nevela dev
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

## nevela status

Check the app.

```sh
nevela status
```

```
  Nevela ................................................ 0.5.0 (latest)
  Laravel / PHP ....................................... 13.34.0 / 8.5.11
  Database ............................ sqlite · database/database.sqlite
  Migrations ...................................... 8 ran, none pending
  Users who can sign in ............................................... 11
  Resource: Product ....................................... 1,000 records
  Dashboard ................................................ template 0.5.0
  API ............. http://127.0.0.1:8000/api (running, and it is this app)

  Everything looks right.
```

`nevela status -v` also lists the dashboard files you have changed, which are the ones an upgrade will leave alone.

Anything that needs attention is in red, with the command that fixes it: migrations that have not run, a resource whose table is missing, nobody able to sign in, or the dashboard's API address being answered by a different program. The command exits with an error code when it finds a problem, so it works in scripts.

## nevela migrate, and any other artisan command

```sh
nevela migrate                 # php artisan migrate
nevela artisan route:list      # any artisan command, without cd apps/api
```

`nevela tinker`, `nevela test` and `nevela serve` are short for the artisan commands of the same names.

## Without the nevela command

Everything above works without installing anything. There are three longer forms, and they all run the same code.

| | Create an app | Inside an app |
|---|---|---|
| The `nevela` command | `nevela new my-app` | `nevela dev` |
| Your package manager | `pnpm create nevela my-app` | `pnpm nevela dev` |
| The app's own launcher | | `php nevela dev` |
| Artisan, in `apps/api` | | `php artisan nevela:dev` |

With npm the first is `npm create nevela@latest my-app`, and the second is `npm run nevela -- dev`.

### The php nevela launcher

`nevela` is also a small PHP file at the top of every app. It saves the `cd apps/api`, and it hands your command to artisan in the same process, so arguments arrive exactly as you typed them. It takes the same commands as the `nevela` command does inside an app:

| You type | It runs |
|---|---|
| `php nevela dev` | `php artisan nevela:dev` |
| `php nevela status` | `php artisan nevela:status` |
| `php nevela --version` | `php artisan nevela:version`: the version of Nevela the app is on |
| `php nevela resource …` | `php artisan nevela:resource … --migrate` |
| `php nevela generate` | `php artisan nevela:generate` |
| `php nevela seed …` | `php artisan nevela:seed …` |
| `php nevela user` | `php artisan nevela:user` |
| `php nevela upgrade` | `php artisan nevela:upgrade` |
| `php nevela update` | the same: the name it had before 0.3.0 |
| `php nevela migrate` | `php artisan migrate` |
| `php nevela artisan <command>` | any other artisan command, for example `php nevela artisan route:list` |
| `php nevela` | the list of commands |

Run through artisan directly, `nevela:resource` does not create the table unless you add `--migrate`. The other forms add it for you.

The file is written by `nevela generate` and kept up to date by it. Add your own shortcuts below its generated block. It is created when the Laravel app sits at `<project>/apps/<name>`, which is how `nevela new` lays a project out. For another layout, set `root_path` in `config/nevela.php`.

### When `php` is not a command

In Git Bash on Windows with Laravel Herd, `php` is not found, because PHP there is `php.bat`. The `nevela` command works in every shell, and so does your package manager:

```sh
pnpm nevela dev
pnpm nevela resource Product --fields="name:string, price:money" --seed
pnpm nevela upgrade
```
