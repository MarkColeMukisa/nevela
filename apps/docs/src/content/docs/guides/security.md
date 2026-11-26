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

## Repeat offenders blocked

An address that keeps doing the wrong thing is blocked for a while: every request from it answers `403` until the block ends, before the app does any work.

- **What counts.** A scanner's probe, a request beyond the [per-address limit](#a-limit-on-the-signed-in-api), and wrong passwords for [many different accounts](#wrong-passwords) are strikes. The per-person limit isn't: one person's trouble shouldn't block everyone behind an office's shared address.
- **How many.** 20 strikes in 10 minutes block the address for an hour (`NEVELA_BLOCK_AFTER`, `NEVELA_BLOCK_WINDOW`, `NEVELA_BLOCK_MINUTES`). `NEVELA_BLOCK_AFTER=0` never blocks by itself.
- **IPv6 by its /64.** One person usually holds a whole /64 and could change address with every request, so the /64 is counted and blocked as one.
- **Whose address.** A request the web app makes for a visitor counts against that visitor. The web app's own server is never counted or blocked, or everyone using the site would be. A blocked visitor is sent to a page that says so.

```json
{ "error": "Requests from your address are blocked for now, after too many of the wrong kind. Try again later.", "code": "ADDRESS_BLOCKED", "until": "2026-11-26T13:05:00+00:00" }
```

### The block list

Under **Blocked addresses** in the admin, and on the phone under Account, whoever holds its permissions sees what is blocked and why, blocks an address for an hour, a day, a week or until cleared, and clears a block. It is a permission of its own (Blocked addresses: view, create, delete), held by administrators until you give it to a role. Blocking and clearing ask the person to [confirm it's them](/guides/authentication/#confirming-its-you-again) where the app asks for that.

Nobody can block this server, an address on the exempt list, or the address they are using themselves.

### Never blocked

This computer (127.0.0.1) never is, and neither is anything in `NEVELA_EXEMPT`: addresses and ranges, with commas between, such as an office or an uptime monitor.

```sh
NEVELA_EXEMPT=203.0.113.0/24,198.51.100.5,2001:db8::/32
```

Behind a proxy that hides the visitor's address, every visitor looks like the proxy, and blocking one would block everyone. Set up Laravel's trusted proxies so the visitor's address comes through, or list the proxy in `NEVELA_EXEMPT`. On Laravel Cloud there is nothing to do: the address Laravel sees is already the visitor's.

### Locked out yourself

On the server, with no dashboard needed:

```sh
php nevela security blocked                    # what is blocked
php nevela security unblock 203.0.113.7        # clear it
php nevela security block 203.0.113.7 --minutes=60 --note="Trying passwords"
```

## Wrong passwords

Wrong passwords are counted by the address and the account together, so a lockout falls on whoever is guessing, not on the account's owner.

- **One address, one account.** After 3 wrong, the web sign-in asks to show it's a person (Cloudflare Turnstile) before it checks another. After 10, that address is locked out of that account for 15 minutes, even with the right password. The owner on another network signs in as ever, and so does everyone else at the same address.
- **One account, any address.** After 20 wrong in an hour from anywhere, every web sign-in to it asks to show it's a person, the owner's included, until the hour is up. It is never locked: an account that could be locked from anywhere could be locked by anyone who knows its email.
- **One address, many accounts.** Wrong passwords for more than 10 different accounts from one address within 10 minutes is someone trying a list. Each further account is a [strike](#repeat-offenders-blocked), which soon blocks the address. The same account again isn't, so one person's typos never add up to a block.
- **The right password** starts that address again on that account, and so does resetting the password.

The lockout covers the password only. An emailed code, a sign-in link, a passkey or Google and GitHub still sign the owner in, where the app offers them.

A locked sign-in answers `429`, with how long to wait in words and in `Retry-After`:

```json
{ "error": "Too many wrong passwords for this account from here. Try again in 15 minutes, sign in another way, or reset the password.", "code": "SIGN_IN_LOCKED", "retryAfter": 900 }
```

The person check answers `428` with `CAPTCHA_REQUIRED`. The sign-in form then shows the widget and sends its answer as `turnstile`. It is asked only of a web sign-in that can show it: the form says so with `canCheck`. The phone can't show it, so the phone, and anything else calling the API itself, goes on to the lockout at 10. An email with no account is counted and answered the same, so none of this says which emails have one.

The person check needs Turnstile [set up](/guides/protecting-forms/#setting-up-turnstile): `TURNSTILE_SECRET_KEY` in the Laravel app, and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in each web app people sign in on. With a site and an admin, that means the admin's environment too, since that is where staff sign in. Add the admin's domain to the widget's domains in Cloudflare, and to `TURNSTILE_HOSTNAMES` if you set it. A web app built without the site key isn't asked, and goes on to the lockout like the phone. Without the secret there is no check anywhere, only the lockout.

| Setting | Default | What it does |
| --- | --- | --- |
| `NEVELA_SIGN_IN_CAPTCHA_AFTER` | `3` | Wrong passwords from one address before the web sign-in asks for the person check. |
| `NEVELA_SIGN_IN_LOCK_AFTER` | `10` | Wrong passwords from one address before it is locked out of that account. |
| `NEVELA_SIGN_IN_LOCK_MINUTES` | `15` | How long the lockout lasts. |

`0` switches the check or the lockout off. The account-wide check (`security.sign_in.account_captcha_after`, 20) and the list rule (`security.sign_in.stuffing_after`, 10) are set in `config/nevela.php`. To lift a lockout early, the person resets their password.

## What the edge does instead

Flooding a site with traffic (DDoS) is stopped before it reaches the app, by the host's edge or Cloudflare in front of it. Nothing in the app can do that: by the time a request reaches PHP, it has used what the attack was after. On Laravel Cloud, every plan already has a Cloudflare-backed edge with DDoS mitigation and a WAF. See [Deploying to Laravel Cloud](/guides/laravel-cloud/).
