---
title: "Authentication"
description: "Signing in with a password, a passkey, an emailed link or code, with two-factor, a profile picture and a list of devices. Laravel holds the accounts; the screens are Flare's."
---

Laravel holds the accounts and decides who gets in. The sign-in and account screens are Flare's, unchanged, and talk to Laravel through the web app. A signed-in browser keeps a [Sanctum](https://laravel.com/docs/sanctum) token in an httpOnly cookie: the browser sends it, and scripts on the page cannot read it.

## What is included

| | |
|---|---|
| **Password** | Sign in, forgot password, reset by an emailed link, change it from the account page. |
| **Two-factor** | A code from an authenticator app, or a code by email, after the password. Ten backup codes. |
| **Passkeys** | Face ID, Touch ID, Windows Hello or a security key. No password to type. |
| **Emailed link, emailed code** | Sign in from an email, without a password. |
| **Email verification** | A six-digit code, and a link that carries it. |
| **Profile** | Name, and a picture that is [optimised like any image](/guides/images/). |
| **Devices** | Every browser signed in to the account, and signing them out. |
| **Sign-up** | Off until you switch it on. See below. |

Not included yet: signing in with Google, GitHub and other providers.

## The pages

| Page | What it is |
|---|---|
| `/sign-in` | Email first, then a password, a link or a code. A passkey button beside it. |
| `/two-factor` | The second step, when the account has one. |
| `/sign-up` | Create an account. Closed unless registration is on. |
| `/forgot-password`, `/reset-password` | Ask for a reset link, and choose the new password. |
| `/verify-email` | Enter the code from the email, or arrive by its link. |
| `/dashboard/account` | Profile: picture, name, email. |
| `/dashboard/account/password` | Change the password. |
| `/dashboard/account/security` | Two-factor and passkeys. |
| `/dashboard/account/sessions` | Devices. |

## Creating users

```sh
nevela user
```

It asks for a name, an email, a password and a role. Pass them as options to skip the questions: `nevela user --name="Ada Okafor" --email=ada@example.com --password="…" --role=EDITOR`. The first account in an app is its administrator.

People with the permission can also add, change, switch off and delete users from the dashboard's **Users** screen: see [Users, roles and permissions](/guides/policies/).

### Letting people sign up

Sign-up is off by default: most dashboards are for a team, not for the public.

Someone who signs up gets the `USER` [role](/guides/policies/), which allows nothing beyond their own account, so opening sign-up doesn't open your data. An administrator gives them more from the Users screen.

To open it:

1. Add `NEVELA_REGISTRATION=true` to `apps/api/.env`.
2. Run `nevela generate`, so the sign-in page shows the link.

:::caution[An app from before 0.5.0]
Its policies still say `return true`, which lets every signed-in user do everything whatever their role. Change them to ask for permissions before opening sign-up: see [Upgrading an app from before 0.5.0](/guides/policies/#upgrading-an-app-from-before-050).
:::

To have new accounts prove their address before they can sign in, set `require_email_verification` to `true` in `config/nevela.php`.

## Email in development

Codes and links are sent with whatever mailer your Laravel app is configured with. A new app uses the `log` mailer, which sends nothing. So in development Nevela also prints each code or link in the terminal where `nevela dev` is running:

```
api │ Nevela mail to ada@example.com: Your Laravel sign-in code
api │     482913
```

Copy it from there. In production, set `MAIL_MAILER` and its settings in `apps/api/.env` as for any Laravel app.

## Two-factor

From **Account → Security**, a person can add a second step to password sign-in.

- **An authenticator app.** They scan a QR code, then type a code from the app to confirm it. Nothing is switched on until that code is right, so a failed setup cannot lock anyone out.
- **Email codes.** A six-digit code is emailed at each sign-in.
- **Backup codes.** Ten are shown once, when two-factor is set up. Each signs in one time when the phone is not to hand. They can be replaced, which stops the old ones working.

Turning two-factor on, off, or replacing the backup codes asks for the password again.

When the second step is asked for:

| Signed in with | Account has an authenticator app | Account's second step is email only |
|---|---|---|
| a password | asked: the app, an emailed code or a backup code | asked: an emailed code or a backup code |
| an emailed link or code | asked: the app or a backup code, not another email | signed in |
| a passkey | signed in | signed in |

An emailed link followed by an emailed code would be the same proof twice, so someone who had only got into the mailbox would be let in. That is why email is not offered as the second step after an email. A passkey is not asked for more: it is something the person has, unlocked by something they are or know.

A code from the app works once. Typing the same six digits again, in the same half minute, is refused.

## Passkeys

A passkey is a key pair. The private half stays with the person: on one device, or synced between their own devices by their password manager (iCloud Keychain, Google Password Manager and the like). It is never sent to your app. Laravel keeps the public half. To sign in, the device signs a random challenge and Laravel checks the signature.

From **Account → Security → Add a passkey**, the browser asks the device to create one. After that, **Sign in with a passkey** on the sign-in page signs in with no email and no password. Browsers that support it also offer saved passkeys in the email field.

Passkeys are tied to the address of the dashboard, so two things have to be true:

- The dashboard is on `https`, or on `localhost`. Browsers refuse passkeys anywhere else.
- Laravel knows the dashboard's address: set `NEVELA_WEB_URL` (see [Going to production](#going-to-production)).

## The profile picture

Uploading a picture on the profile page sends it through the same optimiser as any [image field](/guides/images/), with the `avatar` profile: it is turned the right way up, stripped of its metadata, cropped to a 400×400 square in WebP, and given an 80×80 thumbnail for the menus. A 1.2 MB, 4000×3000 photo came out as 37 KB, with a 4 KB thumbnail.

Change the sizes under `uploads.profiles.avatar` in `config/nevela.php`.

## Devices

Each sign-in creates a token, and each token is a device in **Account → Devices**, with its browser, its address and when it was last used. The browser and address are what the dashboard reports about the visitor, which Laravel believes because the two share a secret (`NEVELA_PROXY_SECRET`, written into both apps when the app is created). Someone calling the API directly cannot choose how their device is listed. The page can sign out every other device. Changing the password does the same, and resetting a forgotten password signs out every device, this one included.

## Closing an account

At the foot of **Account → Profile**, **Close account** lets someone close their own. It takes their password, signs them out everywhere, and keeps the account for an administrator to restore or remove for good. Their email can't sign up again meanwhile. See [Deleted accounts](/guides/deleted-accounts/), which also says how to switch this off.

## Switching methods on and off

The choices are in the `auth` section of `config/nevela.php` in the Laravel app. Publish the file to change them:

```sh
nevela artisan vendor:publish --tag=nevela-config
```

| Key | Default | |
|---|---|---|
| `registration` | `false` | People can create their own account. |
| `magic_link` | `true` | Sign in with an emailed link. |
| `email_code` | `true` | Sign in with an emailed code. |
| `passkeys` | `true` | Passkeys. |
| `two_factor.authenticator` | `true` | An authenticator app as the second step. |
| `two_factor.email` | `true` | Emailed codes as the second step. |
| `require_email_verification` | `false` | Refuse password sign-in until the address is verified. |
| `check_breached_passwords` | `true` | Refuse a new password that appears in a known breach. |

Then run `nevela generate`. That writes the choices to `apps/web/lib/auth-config.ts`, so the screens stop offering what is off. Laravel refuses a method that is off whatever the screens show.

## Passwords

A new password needs eight characters. The forms show a strength reading and advice as it is typed, which is advice only: length matters more than punctuation.

A new password is also checked against [Have I Been Pwned](https://haveibeenpwned.com/Passwords)'s list of breached passwords, and refused if it is on it. Only the first five characters of the password's hash leave your server, and if the service cannot be reached the password is accepted.

## What protects sign-in

- **Attempts are limited** to ten a minute per account, so a password cannot be guessed at speed.
- **A code allows five wrong guesses**, then it is thrown away. Six codes an hour can be sent to one address.
- **Links and codes work once** and expire: sign-in links and codes in 5 minutes, reset and verification in an hour.
- **Nothing says whether an address has an account.** Asking for a reset link, a sign-in link or a code gets the same answer either way, and a wrong password and an unknown address get the same answer in the same time.
- **Secrets are not readable in the database.** Authenticator secrets are encrypted with the app key, backup codes are stored as hashes, and a passkey's stored half is public by design.
- **Emails only link to your dashboard.** The address in a link is the one you configured, never one a request supplied. Where to go after signing in is a path on the dashboard and nothing else.

## Going to production

In `apps/api/.env`:

```sh
# Where the dashboard is. Links in emails point here, and passkeys are tied to it.
NEVELA_WEB_URL=https://app.example.com

# A real mailer, as for any Laravel app.
MAIL_MAILER=smtp
MAIL_FROM_ADDRESS=hello@example.com

# The same value as in the dashboard's environment. See Devices, above.
NEVELA_PROXY_SECRET=a-long-random-string
```

And `NEVELA_PROXY_SECRET` with the same value wherever the dashboard runs. An app created with 0.4.0 or later has one in both `.env` files already; copy it to your hosts. Without it, a device is listed with the address the request reached Laravel from, which in production is your dashboard's server.

In development you do not need `NEVELA_WEB_URL`: any `localhost` address is accepted, because the dashboard moves to another port when 3000 is taken.

## Over the API

Every endpoint is under `/api/auth`. The [REST API reference](/reference/api/#signing-in) lists them. In short, to get a token:

```sh
curl -X POST http://127.0.0.1:8000/api/auth/token \
  -H 'Accept: application/json' -H 'Content-Type: application/json' \
  -d '{"email": "ada@example.com", "password": "…"}'
```

```json
{ "token": "1|…", "user": { "id": "1", "name": "Ada Okafor", "email": "ada@example.com" } }
```

Send it as `Authorization: Bearer <token>` on every other request. If the account has two-factor on, there is no token in that answer yet: see the reference.

## How the browser stays signed in

Scripts on the page never see the token. The auth screens call the web app's own `/api/auth/…` route, which passes each request to Laravel. When Laravel answers with a token, the route puts it in an httpOnly cookie named `nevela_token`, which the browser stores and sends but page scripts cannot read, and removes it from the answer. It lasts 30 days. Signing out revokes the token in Laravel and removes the cookie.

`lib/auth-client.ts` in the web app has the browser's side of this, under the method names Flare's screens call. That is why the screens could be copied without changes.

## Using your own auth

Set `auth.enabled` to `false` in `config/nevela.php` and Nevela registers none of these routes. Provide your own `auth:sanctum` tokens, or change `middleware` to the guard you use.
