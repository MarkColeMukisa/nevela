---
title: "Security"
description: "What a Nevela app does for itself against abuse, on any host: a limit on the signed-in API, scanners turned away, and what is the edge's job instead."
---

Some protection belongs at the edge, in front of the app, and some in the app. Nevela does the app's part itself, on any host, with nothing more to deploy. Grit's [Sentinel](https://github.com/MUKE-coder/sentinel) is where the ideas come from.

## A limit on the signed-in API

Every signed-in route has a limit: the resources' lists, records and actions, and Nevela's own (people, roles, the trash, notifications). It is counted two ways:

- **Per person**, 600 requests a minute (`NEVELA_API_PER_PERSON`). A stolen token can't be run as fast as a script likes.
- **Per address**, 1,200 a minute (`NEVELA_API_PER_ADDRESS`). A script can't spread itself over many accounts to get round the first.

A request beyond the limit answers `429` with how long to wait, in words and in `Retry-After`:

```json
{ "error": "Too many requests at once. Try again in 42 seconds.", "code": "TOO_MANY_REQUESTS", "retryAfter": 42 }
```

A request the web app makes for a visitor is counted against that visitor's address, which the web app passes on with the [shared secret](/guides/deploying/#the-web-app). It isn't counted against the web app's own server, which would put everyone using the dashboard on one allowance. Where the web app can't tell who it is for, only the person's own limit applies.

Set either to `0` to switch it off. The sign-in routes keep their own, stricter limits ([What protects sign-in](/guides/authentication/#what-protects-sign-in)), and [public routes](/guides/public-site/#throttling) theirs.

## Scanners turned away

Bots try every site for files nobody should serve: `/.env` (and `laravel.env`, `.env.backup` and the like), a `.git` folder, WordPress's login and admin, phpMyAdmin, PHPUnit's script left in `vendor`, database dumps. A Nevela app answers each with `404` at once, before any of the app's own work, and counts it against the address it came from.

`NEVELA_SCANNERS=false` switches it off. To turn away more, add regular expressions on the path to `security.scanner_paths` in `config/nevela.php`:

```php
'security' => [
    'scanner_paths' => ['#^old-admin#'],
],
```

## What the edge does instead

Flooding a site with traffic (DDoS) is stopped before it reaches the app, by the host's edge or Cloudflare in front of it. Nothing in the app can do that: by the time a request reaches PHP, it has used what the attack was after. On Laravel Cloud, every plan already has a Cloudflare-backed edge with DDoS mitigation and a WAF. See [Deploying to Laravel Cloud](/guides/laravel-cloud/).
