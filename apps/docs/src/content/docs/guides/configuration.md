---
title: "Configuration"
description: "The settings in config/nevela.php and the web app's environment."
---

## Laravel: config/nevela.php

The package works without a config file. To change a setting, publish it:

```sh
php artisan vendor:publish --tag=nevela-config
```

The file is yours, and an upgrade never changes it. A setting it doesn't have takes the package's default, including those added to a section since you published it, so a file from an older Nevela still gets the new settings. A list, such as `middleware` or `rich_text.tags`, is yours whole: it replaces the package's, not adds to it. The same goes for `rich_text.attributes` and for each image profile you define. `nevela status` and `nevela upgrade` name the settings your file doesn't have.

| Key | Default | Meaning |
|---|---|---|
| `descriptors_path` | `base_path('nevela/resources')` | Where the resource descriptors are kept. |
| `web_path` | `base_path('../web')`, or `NEVELA_WEB_PATH` | The web app's folder. Generated web files are written here. If the folder does not exist, web files are skipped. Set to `null` to never write them. |
| `root_path` | worked out, or `NEVELA_ROOT_PATH` | The top of the project, where the `php nevela` launcher is written. By default two folders up, when the app is at `<project>/apps/<name>`. Set to `false` for no launcher. |
| `prefix` | `api` | The URL prefix for every Nevela route. |
| `middleware` | `['api', 'auth:sanctum']` | Middleware on the resource routes. |
| `auth.enabled` | `true` | Whether Nevela registers the token endpoints. Turn off to provide your own. |
| `auth.token_name` | `nevela-web` | The name given to a device when the request sends no `deviceName`. |
| `auth.session.access` | 15, or `NEVELA_SESSION_ACCESS` | Minutes an access token works. See [How long a sign-in lasts](/guides/authentication/#how-long-a-sign-in-lasts). |
| `auth.session.idle` | 7 days, or `NEVELA_SESSION_IDLE` | Minutes unused before a sign-in ends. Null for no limit. |
| `auth.session.absolute` | 30 days, or `NEVELA_SESSION_ABSOLUTE` | Minutes after which a sign-in ends, however busy. Null for no limit. |
| `auth.session.reuse_seconds` | 60 | How long after a refresh token is swapped a second request with it is still let through. |
| `auth.registration` | `false`, or `NEVELA_REGISTRATION` | Whether people can create their own account. See [Letting people sign up](/guides/authentication/#letting-people-sign-up). |
| `auth.magic_link`, `auth.email_code`, `auth.passkeys` | `true` | Ways of signing in beside the password. |
| `auth.two_factor.authenticator`, `auth.two_factor.email` | `true` | What the second step can be. |
| `auth.require_email_verification` | `false` | Refuse password sign-in until the address is verified. |
| `auth.check_breached_passwords` | `true` | Refuse a new password found in a known breach. |
| `auth.web_url` | `http://localhost:3000`, or `NEVELA_WEB_URL` | Where the dashboard is: for links in emails, and for passkeys. |
| `auth.attempts_per_address` | `300` | Sign-in attempts a minute from one address, on top of ten per account. |
| `auth.proxy_secret` | none, or `NEVELA_PROXY_SECRET` | Shared with the dashboard, so Laravel believes what it says about a visitor's browser. See [Devices](/guides/authentication/#devices). |
| `auth.close_account` | `true` | Whether people can close their own account from the Account page. See [Deleted accounts](/guides/deleted-accounts/#switching-close-account-off). |
| `auth.default_role` | `USER` | The [role](/guides/policies/) someone who signs up starts with. `null` gives none. |
| `permissions` | `[]` | Permissions of your own, beside the ones every resource gets. See [Permissions of your own](/guides/policies/#permissions-of-your-own). |
| `auth.issuer` | the app's name | The name an authenticator app and a passkey prompt show. |
| `per_page` | `25` | Records per page when a list request does not say. |
| `max_per_page` | `100` | The most a list request may ask for. |
| `bulk_max` | `500` | The most rows `POST /{slug}/_bulk` creates in one request. The dashboard's "Add several" grid stops at 500 rows itself; set this lower and Laravel refuses a larger grid, saying what the limit is. |
| `rich_text.tags`, `.attributes`, `.schemes` | the editor's toolbar; `href` on links; `http`, `https`, `mailto` | What a [rich text](/concepts/field-types/#rich-text) field keeps. Everything else is removed when a record is saved and again when it is read. |
| `trash.days` | `30` | How many days a deleted record stays in [the trash](/guides/trash/) before it is removed for good. `null` keeps it until someone removes it. |
| `public.turnstile.secret` | `TURNSTILE_SECRET_KEY` | The secret key for a form's [robot check](/guides/protecting-forms/#setting-up-turnstile). |
| `public.turnstile.hostnames` | `TURNSTILE_HOSTNAMES`, or the web app's own | The sites a robot check may be [solved on](/guides/protecting-forms/#where-a-check-counts). Never `localhost` in production. |
| `public.form_lifetime` | `7200` | How long a protected form can sit open before it is asked to try again, in seconds. |
| `public.mail.visitor_per_hour`, `visitor_per_day` | `1`, `3` | How often one address is emailed because someone typed it into a form. See [The mail a form causes](/guides/protecting-forms/#the-mail-a-form-causes). |
| `public.notify.to` | `NEVELA_NOTIFY_TO`, or the address the app sends from | Who is told a form was sent. |
| `public.notify.max_per_hour` | `10` | Notices sent as they happen. The rest wait for one email at the top of the hour. |
| `public.confirm.hours` | `48` | How long an address has to follow its link before the record is removed. |
| `public.confirm.path` | `/confirm` | The page of the web app the link opens. |
| `uploads.disk` | `public`, or `NEVELA_UPLOADS_DISK` | The disk file and image fields store on. |
| `uploads.url` | none, or `NEVELA_UPLOADS_URL` | The address files are served from, when a CDN or your web server serves the disk. |
| `uploads.originals_disk` | `local`, or `NEVELA_ORIGINALS_DISK` | Where untouched originals of images are kept. |
| `uploads.private_disk` | `local`, or `NEVELA_PRIVATE_DISK` | Where [private files](/guides/images/#private-files) are kept. It must not be a disk the web server serves. |
| `uploads.max_bytes` | 10 MB | The largest file a field takes. |
| `uploads.memory` | `512M` | Memory allowed while an image is optimised. |
| `uploads.profiles` | `default`, `product`, `avatar`, `cover` | How images are optimised. See [Files and images](/guides/images/#profiles). |

### Environment

| Variable | Meaning |
|---|---|
| `NEVELA_WEB_PATH` | Overrides `web_path`. Use it when the web app is not at `../web`. |
| `NEVELA_CURRENCY` | The currency money is shown in, as its ISO 4217 code: `UGX`. A money field can name its own. Run `nevela generate` after changing it. See [Money and its currency](/concepts/field-types/#money-and-its-currency). |
| `NEVELA_SESSION_ACCESS`, `NEVELA_SESSION_IDLE`, `NEVELA_SESSION_ABSOLUTE` | How long a sign-in lasts, in minutes: 15, 7 days and 30 days unless set. See [How long a sign-in lasts](/guides/authentication/#how-long-a-sign-in-lasts). |
| `SOCIAL_AUTH_ENABLED` | `true` turns on signing in with [Google and GitHub](/guides/authentication/#google-and-github). Off unless set. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google's keys. Google is offered once both are set. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub's, the same. |
| `TURNSTILE_SECRET_KEY` | Cloudflare's secret key, for forms with `"turnstile": true`. |
| `TURNSTILE_HOSTNAMES` | The sites a robot check may be solved on, with commas between, when they aren't `NEVELA_WEB_URL`'s. |
| `NEVELA_NOTIFY_TO` | Who `PublicMail::toOwner()` writes to. The address the app sends from, unless set. |

### If you change the prefix

Set the same prefix in the web app's `NEVELA_API_URL`. With `'prefix' => 'v1'`, the web app needs `NEVELA_API_URL=http://127.0.0.1:8000/v1`.

### If you raise max_per_page

The dashboard's export reads 100 records per request (`EXPORT_PAGE` in `apps/web/app/dashboard/actions.ts`). It keeps working with a higher limit; raise that constant too if you want faster exports.

## Web app: .env.local

| Variable | Default | Meaning |
|---|---|---|
| `NEVELA_API_URL` | `http://127.0.0.1:8000/api` | Where the Laravel API is, including the prefix. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | none | Cloudflare's site key, for forms with the [robot check](/guides/protecting-forms/#setting-up-turnstile). Built in: rebuild after changing it. |
| `NEXT_PUBLIC_SESSION_IDLE_MS` | `870000` (14 min 30 s) | How long without activity before the dashboard asks "Still there?". `0` turns it off. Built in. See [How long a sign-in lasts](/guides/authentication/#how-long-a-sign-in-lasts). |
| `NEXT_PUBLIC_SESSION_COUNTDOWN_MS` | `30000` | How long it counts down before signing out. Built in. |

Copy `.env.example` to `.env.local` and change it there. The dev server reads the file on its own when it changes.

## Requirements

| | Version |
|---|---|
| PHP | 8.2 or newer for the package. The Laravel app in `apps/api` uses Laravel 13 and needs 8.3 or newer. |
| Laravel | 11, 12 or 13 |
| Node.js | 20 or newer |
| pnpm | The version in the root `package.json` under `packageManager` |
