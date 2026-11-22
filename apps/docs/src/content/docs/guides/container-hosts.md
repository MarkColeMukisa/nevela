---
title: "Deploying to a container host"
description: "The Laravel app on Sevalla, Railway, Fly.io, Render and other hosts that run one container from a start command: a disk that lasts, the queue, the scheduler without cron, and caching."
---

Many hosts build the Laravel app into a container and run it from a start command: Sevalla, Railway, Fly.io, Render and others. They differ from a server you manage in two ways that matter to Nevela:

- **There is often no cron**, and no switch for Laravel's scheduler as on [Laravel Cloud](/guides/laravel-cloud/).
- **The container's own files go at each deploy.** Only a disk you add lasts, and it often belongs to one process: a second process (a separate worker or cron service) can't write where the web process reads.

So run everything the app needs in the one container, beside the web server, and keep what must last on the disk. Everything in [Deploying](/guides/deploying/) still applies. This page covers what is different.

## The start command

```sh
php artisan migrate --force \
  && php artisan storage:link \
  && php artisan optimize \
  && (php artisan schedule:work &) \
  && exec <start the web server>
```

`<start the web server>` is what your host runs by default. On Sevalla it is `/usr/local/bin/ingot-laravel-start`. Ending on `exec` makes the web server the container's main process, so the host's restarts and health checks reach it.

## A disk that lasts

Add a persistent disk and mount it at `storage/app` in the Laravel app. That folder holds:

- **Uploads.** Images and files go to the `public` disk (`storage/app/public`) unless `NEVELA_UPLOADS_DISK` names another; [private files](/guides/images/#private-files) go to `storage/app/private`. `php artisan storage:link` in the start command links `public/storage` to them again in each new container.
- **The SQLite database**, if you use one: set `DB_DATABASE` to its full path on the disk, for example `/app/storage/app/database.sqlite` where the app is in `/app`. From 0.34.1 Nevela sets SQLite up for many requests at once, which a dashboard or a phone's home screen makes. Writes wait up to five seconds for each other (`busy_timeout`), readers carry on while something is written (`journal_mode=wal`), and a transaction takes the write lock when it starts. Without these, busy moments answer "database is locked". A value of your own in `config/database.php` is kept, and `DB_BUSY_TIMEOUT`, `DB_JOURNAL_MODE`, `DB_SYNCHRONOUS` and `DB_TRANSACTION_MODE` change them.

With a managed database (Postgres, MySQL) instead, only the uploads need the disk. Or set `NEVELA_UPLOADS_DISK` to an S3-compatible disk and the container needs no disk at all.

Keep `CACHE_STORE` on `database` (or Redis). Sign-in codes, links and rate limits live in the cache, and so does the sign the scheduler leaves for `nevela deploy:check`.

## The queue

Form notices and confirmation emails are queued. Without a separate worker, pick one of these:

- **`QUEUE_CONNECTION=deferred`**: each job runs right after its request has been answered, in the same process. It needs no worker.
- **`QUEUE_CONNECTION=sync`**: each job runs while the visitor waits. It works, but a slow mail server slows the request.
- **A worker in the same container**: add `(php artisan queue:work --tries=3 &) &&` to the start command, before the scheduler, and keep `QUEUE_CONNECTION=database`.

## The scheduler

The scheduler empties [the trash](/guides/trash/) each night, removes [ended sign-ins](/guides/authentication/#how-long-a-sign-in-lasts) and sends the hourly digest of form notices. Where there is no cron, `php artisan schedule:work` does cron's job: it stays running and starts each task at its time. The `(php artisan schedule:work &)` in the start command runs it beside the web server, so it writes to the same disk and cache the web process reads.

Until it has run, the bell tells administrators **The scheduler isn't running**. It leaves a sign every 5 minutes, so after a deploy give it 5 minutes.

## Caching config and routes

`php artisan optimize` caches the config, routes, events and views, which many hosts run on start. That is fine from Nevela 0.33.1.

**On 0.33.0 and earlier, don't cache routes.** With routes cached, every sign-in and every public route answered with a 500 (`Rate limiter [nevela-auth] is not defined`, `Target class [nevela.throttle] does not exist`). Cache the rest one by one instead (`config:cache`, `event:cache`, `view:cache`), or [upgrade](/guides/updating/).

## Checking it

Once it is deployed, open a shell in the container and run:

```sh
php artisan nevela:deploy:check
```

It checks the environment, migrations, cache, scheduler, queue, mail and the dashboard, and says what to change for each problem. See [nevela deploy:check](/reference/commands/#nevela-deploycheck).
