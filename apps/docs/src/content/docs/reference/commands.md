---
title: "Commands"
description: "Every nevela command and option: new, update, resource, resource:remove, adopt, blog, generate, seed, user, upgrade, trash, disposable, publish, deploy:check, digest, dev, status and --version, the artisan commands it passes on, and what the scheduler runs."
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
nevela adopt posts         # make a resource of a table you already have
nevela resource:remove Product   # take a resource out again
nevela blog                # give the site a blog, if it has none
nevela generate
nevela seed Product
nevela user
nevela upgrade             # bring the app to the latest Nevela
nevela migrate
nevela trash               # remove deleted records whose 30 days are up
nevela disposable          # fetch the current list of throwaway email domains
nevela publish             # write config/nevela.php, to change a setting
nevela deploy:check        # on the server: scheduler, queue worker, mail, the dashboard
nevela digest              # email the owner the form notices held back this hour
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
| `--no-blog` | Leave out [the blog](/guides/blog/): the Post resource, its three sample posts and `/blog`. |
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
| `--items=` | Its lines, as a second resource: their name, a colon, and their fields. `--items="OrderItem: product:belongsTo(Product), quantity:int, price:money"`. They are given a field pointing back here, and edited in this one's form. See [Line items](/guides/line-items/). |
| `--icon=` | A Lucide icon name for the dashboard sidebar. |
| `--group=` | The sidebar heading to put the resource under. |
| `--id=int` | Give the resource the numbered ids of `$table->id()`. Without it, ids are UUIDs. |
| `--force` | Replace the descriptor if the resource already exists. |
| `--no-migrate` | Don't create the table yet. Run `nevela migrate` when you are ready. |
| `--seed`, `--seed=100` | Fill the new resource with records as well: 25, or the number you give. |

It writes the descriptor to `nevela/resources/<name>.json`, generates the files listed in [What gets generated](/concepts/resources/#what-gets-generated), and creates the table, because a new resource is no use without it.

If the resource already exists, the command stops and points you at `nevela generate`, so a typo cannot wipe out an existing descriptor.

## nevela resource:remove

Take a resource out of both apps: the opposite of `nevela resource`.

```sh
nevela resource:remove Product            # what it would do; nothing changes
nevela resource:remove Product --force    # do it
```

Without `--force` it lists every file it would delete or change, and stops. With it:

- **What is still as Nevela wrote it is deleted:** the descriptor, the model, request, API resource, controller and policy, the dashboard's `.resource.ts`, its pages and its actions. A file is Nevela's if nobody has changed it, including inside its generated block. A comment worded differently by an older Nevela, or a loading skeleton made before the resource had all its fields, doesn't count as a change.
- **What you have changed is kept, and listed** for you to remove yourself. `--with-yours` deletes it too.
- **An adopted model loses only Nevela's block.** The model the app had before `nevela adopt` stays.
- **The table and its rows stay, and so do its migrations,** which are the database's history. `--drop-table` writes a migration that drops the table, named so it reads plainly, for you to read and then run with `nevela migrate`. The preview says how many rows there are.
- **Then it regenerates the rest:** the routes, the dashboard's menu, and the relations of the resources it pointed at. Its permissions come out of every role.

It refuses while another resource belongs to this one: take that `belongsTo` field out of the other's descriptor first, or remove that resource. It also lists your own code that still uses the resource, so you can change it:

- a controller that uses its model, or a page that imports its `.resource.ts`, which would no longer build;
- what reads or posts to its public section, such as the blog's `lib/blog.ts` or a site's form, which would build and then fail on the page.

| Option | Meaning |
|---|---|
| `--force` | Do it. Without it, nothing changes. |
| `--with-yours` | Delete the files you have changed as well. |
| `--drop-table` | Also write a migration that drops the table. |

To make a resource of the same name again after its table was dropped, delete its old `create_…_table` migration first. While it is there, `nevela resource` takes the table as made, and writes no migration for it.

## nevela adopt

Make a resource of a table that is already in the database. The descriptor is read from the table, which is left as it is.

```sh
nevela adopt posts
```

| Argument or option | Meaning |
|---|---|
| `table` | The table to adopt. It needs an `id` (integers or UUIDs), `created_at` and `updated_at`. |
| `--name=` | The resource's name, when it isn't the table's own (`posts` is `Post`). |
| `--icon=` | A Lucide icon name for the dashboard sidebar. |
| `--group=` | The sidebar heading to put the resource under. |
| `--yes` | Write it without asking. |
| `--force` | Read the table again and replace the descriptor it already has. |

It shows each column and the field it becomes, lists the columns it leaves alone and why, and asks before writing. No migration is written to create the table; `nevela migrate` afterwards adds the `deleted_at` column that gives it a [trash](/guides/trash/). See [Adding Nevela to an app you already have](/guides/existing-app/).

## nevela blog

Give the site a blog: a Post resource to write in, and `/blog` to read it at. A new app has one already; this is for an app created with `--no-blog`, or before there was one.

```sh
nevela blog
nevela blog --resource=Post --title=title --body=body --image=thumbnail --published=published_at
```

| Option | Meaning |
|---|---|
| `--resource=` | Read the posts from a resource the app already has, and write only the pages. It needs `public.read` with a `by` field. |
| `--title=`, `--body=` | That resource's fields for a post's title and for the post itself. Default: `title` and `body`. |
| `--excerpt=`, `--image=`, `--published=` | Its fields for those, where it has them. |
| `--sample` | Add three posts to start with. For development: refused in production. |
| `--no-migrate` | Don't create the posts table yet. |

The pages are written once into `apps/web` and are yours afterwards. Run again, it writes only what isn't there. See [The blog](/guides/blog/).

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
| `--verified` | Mark the email as verified. Without it the account starts unverified, as nobody has proved the address yet. See [Verified means proved](/guides/authentication/#verified-means-proved). |
| `--sample` | Create the ten sample users instead: two editors and eight users, one switched off. Their password is `password`, or `--password`. Refused in production. |

The first account in an app is its `ADMIN`, whatever `--role` is left out. After that, an account made without `--role` and without being asked is a `USER`, which allows nothing beyond its own account.

Pass the options to create a user without being asked anything. On a server, where the `nevela` command usually isn't installed, use the artisan form:

```sh
php artisan nevela:user --name="Ada Okafor" --email=ada@example.com --password="$ADMIN_PASSWORD" --role=ADMIN
```

### An account that exists

Name the account, and say what to change:

```sh
nevela user --reset owner@example.com                       # a new password, asked for twice, not shown
nevela user --reset owner@example.com --sign-out-everywhere
nevela user --verify owner@example.com                      # mark the address verified
nevela user --role=ADMIN owner@example.com                  # one more role
nevela user --link owner@example.com                        # a sign-in link that works once
nevela user owner@example.com                               # what the account is: roles, address, devices
```

Everything is checked before anything is changed: an unknown role, or a password that is too short or [breached](/guides/authentication/#passwords), changes nothing. Options can be combined.

| Option | Meaning |
|---|---|
| `--reset` | A new password. It is asked for twice, without showing, and never taken from the command line, where your shell's history would keep it. The account's other sign-ins carry on, unless you add `--sign-out-everywhere`. |
| `--password-stdin` | With `--reset`, read the password from standard input, for a server's one-off command with nobody to ask: `printf '%s' "$NEW_PASSWORD" \| php artisan nevela:user owner@example.com --password-stdin` |
| `--sign-out-everywhere` | End every sign-in the account has, on every device, and any token of its own. |
| `--verify` | Mark the address verified. Only for an address you know is theirs. |
| `--role=` | Give the account this role as well as the ones it has. |
| `--link` | Print a sign-in link. It works once, within 15 minutes, and asks for a second step if the account has one. It doesn't mark the address verified, because it wasn't sent there. Whoever opens it is signed in as the account, so send it only to them. Needs sign-in links switched on (`auth.magic_link`). |

A closed account is refused: restore it first, under Deleted accounts. A switched-off one can be changed, and is told it can't sign in until it is switched on.

`nevela status` lists the administrators who can sign in, and is red when there are none.

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

Where the app's queue isn't `sync`, it works the queue too, so the mail a [public form](/guides/protecting-forms/#the-mail-a-form-causes) causes is sent while you develop.

Stopping it with Ctrl+C stops them all.

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

Anything that needs attention is in red, with the command that fixes it: migrations that have not run, a resource whose table is missing, nobody able to sign in, a form whose [robot check](/guides/protecting-forms/#when-the-check-cant-be-made) has no secret key in production, Google or GitHub sign-in switched on with no provider's keys set (in yellow), or the dashboard's API address being answered by a different program. The command exits with an error code when it finds a problem, so it works in scripts.

## nevela trash

```sh
nevela trash
```

Removes, for good, the deleted records that have been in [the trash](/guides/trash/) longer than `trash.days` (30), and says how many of each resource went.

You rarely need to type it. The app's scheduler runs it each night, and opening the Trash page does the same. It is here for a server with neither, and for seeing what a night's run would do.

The same run removes files uploaded through a public form and never sent, and people who joined a list and didn't [confirm their address](/guides/protecting-forms/#proving-an-address) within 48 hours.

## nevela disposable

```sh
nevela disposable
```

Fetches the current list of throwaway email domains, which a form with [`"email"` in its `protect`](/guides/protecting-forms/#the-checks) refuses. The package ships with a list; this replaces it with today's, kept in the app's `storage/app/nevela`. If what comes back isn't the list, the one in use is left alone.

| Option | Meaning |
|---|---|
| `--url=` | Fetch the list from somewhere else: one domain a line. |

## nevela publish

```sh
nevela publish
```

Writes Nevela's settings to `apps/api/config/nevela.php`, with a comment on each, so you can change them. This is Laravel's `vendor:publish --tag=nevela-config`, which works too, and so does `nevela publish --tag=nevela-config`.

Many settings don't need the file: they come from `apps/api/.env`, such as `SOCIAL_AUTH_ENABLED`, `NEVELA_REGISTRATION` and `NEVELA_SESSION_IDLE`. The [Configuration](/guides/configuration/) page lists which. A setting the file doesn't have keeps Nevela's default, so the file can stay short.

If the file is already there, it is left as it is, and the command names the settings it doesn't have, with the release that added each.

| Option | Meaning |
|---|---|
| `--force` | Replace the file with Nevela's. What you changed in it is lost. |

## nevela deploy:check

```sh
php artisan nevela:deploy:check
```

Run it on the server, in the Laravel app, after a deploy. On Laravel Cloud that is a command on the API app. It checks what a deployed app needs and a local one doesn't, and says what to change for each thing that is wrong:

| | Checked |
|---|---|
| **This app** | `APP_KEY` set and `APP_DEBUG` off; migrations run (with a hint when a pooled database address is the reason they fail); a cache that keeps things between requests, which sign-in codes and links need; the scheduler, which leaves a sign every 5 minutes; a queue worker, by sending it a job and waiting for it; mail that is sent, not logged. |
| **Signing in** | `NEVELA_WEB_URL` set to the dashboard's https address; `NEVELA_PROXY_SECRET` set; an administrator who can sign in. |
| **The dashboard** | Asked over `/api/nevela/health`, with the shared secret: whether it answers, whether its secret is this app's, whether it reaches this API (a `NEVELA_API_URL` without `/api` is named with the address to use), and whether `NEXT_PUBLIC_SITE_URL` matches `NEVELA_WEB_URL`. |

It exits with an error when something is wrong, so a deploy script can stop on it.

| Option | Meaning |
|---|---|
| `--wait=` | Seconds to give a queue worker to take the test job. Default 15. |
| `--no-dashboard` | Leave out the questions to the dashboard. |

The test job it sends to the queue does nothing but note that it ran, so one left waiting for a worker does no harm.

## nevela digest

```sh
nevela digest
```

Sends the owner one email naming the form notices that were [held back](/guides/protecting-forms/#the-mail-a-form-causes) in a busy hour. The scheduler runs it at the top of every hour; it is here for a server without one.

## What the scheduler runs

A new app's scheduler runs these by itself, once Laravel's one cron line is on the server (`nevela deploy:check` says whether it is). None needs typing; the ones that are commands can be.

| When | What |
|---|---|
| Every 5 minutes | A sign of life, so `nevela deploy:check` can tell the scheduler is running. |
| Every hour | [`nevela digest`](#nevela-digest). |
| 03:40 | [`nevela trash`](#nevela-trash). |
| 03:50 | `nevela artisan nevela:prune-sessions`: removes sign-ins that have ended and access tokens that have expired. |
| 03:55 | Removes notifications and activity older than they are kept. See [Notifications](/guides/notifications/). |
| 04:10 | Looks up the latest release of Nevela, so the bell can say when there is a newer one. |

`nevela new` finishes a new app with `php artisan nevela:setup`: the key, the migrations and the generated files, and the blog, the starter account and the sample users unless `--no-blog`, `--no-user` or `--no-sample-users` leaves them out. There is no need to run it yourself.

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
| `php nevela adopt …` | `php artisan nevela:adopt …` |
| `php nevela resource:remove …` | `php artisan nevela:resource:remove …` |
| `php nevela blog` | `php artisan nevela:blog` |
| `php nevela generate` | `php artisan nevela:generate` |
| `php nevela seed …` | `php artisan nevela:seed …` |
| `php nevela user` | `php artisan nevela:user` |
| `php nevela trash` | `php artisan nevela:trash` |
| `php nevela publish` | `php artisan nevela:publish` |
| `php nevela deploy:check` | `php artisan nevela:deploy:check` |
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
