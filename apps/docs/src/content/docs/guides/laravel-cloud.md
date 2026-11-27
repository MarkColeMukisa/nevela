---
title: "Deploying to Laravel Cloud"
description: "A Nevela app on Laravel Cloud: the applications, every variable and which must match, the scheduler and worker, Neon, checking it all with one command, and what the edge protects."
---

A Nevela app is three Laravel Cloud applications made from the same repository: the API from `apps/api`, the public site from `apps/web`, and the staff's admin from `apps/admin` ([The site and the admin](/guides/site-and-admin/)). An app made before 0.41 has no `apps/admin`: its `apps/web` is the dashboard and the site, and step 3 doesn't apply. This page goes through both, in the order that works. It is how Kian Rover went to production, with what went wrong at each step turned into what to do. For what any host needs, see [Deploying](/guides/deploying/).

Put both applications and the database in the same region. Every page the dashboard serves asks the API at least once, so the distance between them is paid on every request.

## Before you start

Make a secret for the two apps to share, on your own machine:

```sh
openssl rand -hex 32
```

On Windows, run it in Git Bash. This is `NEVELA_PROXY_SECRET`, and both applications get the same value. Laravel believes what the dashboard says about a visitor (their browser, their address) only from a caller with it. Use a new one for production, not the one your local `.env` files share.

## 1. The API

Create an application on the repository with **root directory `apps/api`**. It is an ordinary Laravel app.

**PHP 8.5.** Nevela runs on the latest PHP. It is the default for a new environment; for an older one, choose it under the environment's General Settings, Runtime, and deploy again. `nevela deploy:check` says which PHP the server runs.

**The database.** Create one and attach it, or put a database's address in the environment. With Neon, keep both of its addresses:

- the **pooled** one (its host has `-pooler` in it) for the app, and
- the **direct** one, the same host without `-pooler`, for migrations.

A migration that creates several tables or indexes in one go fails through the pooler with `SQLSTATE[25P02]: current transaction is aborted`. Nevela's own migrations do, and they live in `vendor`, where you can't change them. So run migrations over the direct address, as in the deploy commands below.

**The environment:**

| Variable | Value |
|---|---|
| `APP_ENV` | `production` |
| `APP_DEBUG` | `false` |
| `APP_KEY` | `php artisan key:generate --show` on your machine. If you ever change it, keep the old one in `APP_PREVIOUS_KEYS` |
| `DATABASE_URL` | The database's address: Neon's pooled one |
| `DATABASE_URL_DIRECT` | With Neon, its direct address, for migrations |
| `NEVELA_WEB_URL` | The web app's address, with https: `https://your-web.laravel.cloud`, or your domain once it has one. Links in emails and passkeys use it |
| `NEVELA_PROXY_SECRET` | The secret you made. **The same in both applications** |
| `MAIL_MAILER`, `MAIL_HOST`, … | A real mailer. With `log`, sign-in links, codes and password resets are written to the log and never arrive |
| `MAIL_FROM_ADDRESS` | An address of yours, not `hello@example.com` |
| `QUEUE_CONNECTION` | `database`, with a worker (below) |
| `CACHE_STORE` | `database`, the default. Not `array`: sign-in codes and links are kept in the cache between requests |

And only if you use them: `SOCIAL_AUTH_ENABLED` and the providers' keys ([Google and GitHub](/guides/authentication/#google-and-github)), `TURNSTILE_SECRET_KEY` ([protected forms](/guides/protecting-forms/#setting-up-turnstile)), `NEVELA_REGISTRATION`.

**The deploy commands:**

```sh
DATABASE_URL="$DATABASE_URL_DIRECT" php artisan migrate --force
```

Without Neon, `php artisan migrate --force` is enough. If the app seeds, add `php artisan db:seed --force`: without `--force` it stops in production to ask, which a deploy can't answer, and fails.

**The scheduler and a worker.** Switch on the scheduler for the application, and add a queue worker running `php artisan queue:work`. Nothing says so when they are missing, but things quietly stop:

- **The scheduler** empties the trash each night, removes ended sign-ins, and sends the hourly digest of form notices.
- **The worker** sends what is queued: a form's notice to you, and the email asking a visitor to confirm their address.

**An administrator.** Once the API is deployed, make one with a command on the application:

```sh
php artisan nevela:user --name="Ada Okafor" --email=ada@example.com --role=ADMIN --password="a temporary password"
```

A password given this way is kept in the host's command history. Sign in with it once, then change it under **Account → Password**. If you are ever locked out, `php artisan nevela:user ada@example.com --link` prints a sign-in link that works once, and needs no password. See [an account that exists](/reference/commands/#an-account-that-exists).

**Check that it answers.** Open `https://your-api.laravel.cloud/api/auth/config` in a browser. A small piece of JSON, starting `{"registration":`, means the address and the API are right.

## 2. The dashboard and site

Create a second application on the same repository, with **root directory `apps/web`**. Leave **"Run as a static website" off**: the dashboard, signing in and the forms need a server.

The dashboard imports `packages/shared` from beside `apps/`, and that works with this root directory. Laravel's support confirmed that Cloud's build has the whole repository, and `next build` bundles what the dashboard imports into its output. So nothing outside `apps/web` is needed when it runs. Nothing has to be set for it.

**Build with the package manager the app was made with.** Its lock file says which: a new app made with Bun has `bun.lock` in `apps/web`, one made with npm `package-lock.json`, one made with pnpm `pnpm-lock.yaml`. Set the build command to match, or Cloud uses npm and ignores a lock file that isn't npm's:

```sh
npx --yes bun@1 install --frozen-lockfile && npx --yes bun@1 run build    # bun.lock
npm ci && npm run build                                                  # package-lock.json
corepack enable && pnpm install --frozen-lockfile && pnpm build          # pnpm-lock.yaml
```

The Bun line fetches Bun through npm, so it works whether or not Cloud's build image has Bun. Bun only installs the packages and runs the build script: the dashboard still runs on Node.

**The environment:**

| Variable | Value |
|---|---|
| `NEVELA_API_URL` | The API's address **with `/api`**: `https://your-api.laravel.cloud/api`. Cloud gives you the bare address; without `/api`, every sign-in fails with "The dashboard can't find the API's sign-in" |
| `NEVELA_PROXY_SECRET` | The same secret as the API's |
| `NEXT_PUBLIC_SITE_URL` | The site's address, as people reach it. The blog's feed and shared links use it. Cloud sets it to the application's own address; set it again once you have a domain |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Only for [protected forms](/guides/protecting-forms/#setting-up-turnstile) |

A variable starting `NEXT_PUBLIC_` is written into the app when it is built, so redeploy after changing one.

When it starts, the web app checks the address and the secret, and writes what is wrong to its log with the value to use. In development it shows the same on the sign-in page.

**Run one replica.** When you save a post, the dashboard tells the web app to forget the blog pages it has kept. On Laravel Cloud each replica keeps its own, so with two or more, only the one that handled the save forgets. The others show the old post for up to a minute. One replica serves a lot of visitors; keep it at one.

## 3. The admin

Create a third application on the same repository, with **root directory `apps/admin`**, set up as the site is: the same build command, one replica, not a static website.

| Variable | Value |
|---|---|
| `NEVELA_API_URL` | The API's address with `/api`, as for the site |
| `NEVELA_PROXY_SECRET` | The same secret as the API's |
| `NEXT_PUBLIC_SITE_URL` | **The site's** address: where a customer who signs in to the admin is sent. Set it before the admin's first build, and build again after changing it |

In the API, set `NEVELA_ADMIN_URL` to the admin's address, and in the site, `NEVELA_ADMIN_URL` as well, for staff's link to it. Staff need two-step sign-in to use the admin in production, and their sign-ins there end after 12 hours: see [What the admin asks of staff](/guides/site-and-admin/#what-the-admin-asks-of-staff).

## 4. Check them all

Run this on the API application, as a command:

```sh
php artisan nevela:deploy:check
```

It checks the API app: the environment, migrations, cache, scheduler, worker, mail, the secret and an administrator. Then it asks the site, and the admin, whether each reaches the API, whether the secrets match, what address it puts in links, and whether the admin sends customers to the site. Each problem is in red with what to change, and it exits with an error until there are none. See [nevela deploy:check](/reference/commands/#nevela-deploycheck).

The scheduler leaves a sign every 5 minutes, so straight after switching it on, give it 5 minutes before checking.

## Domains

The browser only ever talks to the web app's address. The web app's server calls the API, so the API can sit on a subdomain (`api.example.com`) or keep its Cloud address, with no CORS and no shared cookies to set up.

When the site gets its domain, change these:

- `NEVELA_WEB_URL` in the API, to the new address.
- `NEXT_PUBLIC_SITE_URL` in the site, and in the admin, then redeploy both.
- The callback address registered with Google or GitHub, if people sign in with them.

When the admin gets its domain (`admin.example.com`), change `NEVELA_ADMIN_URL` in the API and the site, and register its callback address with Google or GitHub too. To close the admin to everyone but staff, see [Closing the admin off](/guides/site-and-admin/#closing-the-admin-off).
- The Turnstile widget's hostnames, if a form is protected.

**Passkeys are tied to an address.** Those made on the Cloud address don't work on the domain, so their owners sign in another way and add a new one.

## Security at the edge

Laravel Cloud puts a Cloudflare-backed edge in front of every application. What it does, as Laravel's support confirmed in November 2026, and what Nevela does in the app on every plan:

| | On Cloud's edge | In the app (Nevela) |
|---|---|---|
| Floods of traffic (DDoS) | Every plan, nothing to switch on | Can't be, by the time PHP runs: the edge's job |
| A WAF (Cloudflare's OWASP Core Ruleset) | Every plan | |
| Probes like `/.env` | Every plan, from a list you can't change | [Scanners turned away](/guides/security/#scanners-turned-away), with your own paths too |
| Under Attack Mode (a JavaScript challenge for 24 hours) | Every plan, for an attack under way | |
| A limit per address | 100 requests a minute, on Growth and Business | [Per person and per address](/guides/security/#a-limit-on-the-signed-in-api), set as you like |
| Advanced limits, bot categories | Business | |
| Blocking an address or range; a limit on one path such as `/api/auth/token` | Only with a dedicated edge network, a Business add-on | [The block list](/guides/security/#the-block-list), [repeat offenders](/guides/security/#repeat-offenders-blocked) and the [sign-in lockout](/guides/security/#wrong-passwords), on every plan |

Static sites sit behind the same edge.

### The visitor's address

Cloud's edge sets `X-Forwarded-For`, with one address in it, and `X-Real-IP`, and a visitor can't forge either. A `CF-Connecting-IP` header sent by a visitor is refused with 403.

- **Don't set `TrustedProxies` in the API.** `$request->ip()` is already the visitor's address on Cloud, and a list of your own could break that. Nevela sets none.
- **The web apps keep `NEVELA_TRUSTED_PROXIES=1`**, the default: one proxy in front, which is Cloud's edge. That is how the site and the admin pass each visitor's own address to the API, for the limits, the block list and Devices.

### Your own Cloudflare in front

That works: when adding the domain, choose that it is already on Cloudflare and proxied. Cloud's edge rules still apply behind yours, as one more layer. Laravel hasn't yet said whether the visitor's address reaches the app the same way then, so after switching, check **Account → Devices**: each sign-in should show its own address, not one of Cloudflare's.

### What an attack costs

Traffic the edge blocks isn't billed. What reaches the app is usage like any other, and bandwidth past the plan's allowance is $0.10 a GB. **Set a maximum number of replicas** in each environment's autoscaling settings, so an attack that gets past the edge can't scale the bill with it. The site and the admin run one replica anyway (see [step 2](#2-the-dashboard-and-site)); give the API a ceiling you are happy to pay for.

## When something is wrong

| What you see | Why, and what to do |
|---|---|
| "The dashboard can't find the API's sign-in" | `NEVELA_API_URL` has no `/api` |
| `SQLSTATE[25P02]: current transaction is aborted` on migrate | Migrations through Neon's pooled address. Run them over the direct one |
| `db:seed` fails in production | It asks for confirmation. Add `--force` |
| Every device in **Account → Devices** has the same address | `NEVELA_PROXY_SECRET` differs between the apps, or one has none |
| Sign-in links and codes never arrive | Mail isn't set up: `MAIL_MAILER` is `log`, or the mailer's settings are wrong |
| A form's notices and confirmation emails never arrive | No queue worker |
| The trash never empties | The scheduler is off |
| A refresh shows an old blog post, then the new one | The web app runs more than one replica |

`php artisan nevela:deploy:check` finds every one of these by itself except `db:seed` and the replicas.
