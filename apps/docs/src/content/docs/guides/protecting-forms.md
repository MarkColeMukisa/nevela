---
title: "Protecting a public form"
description: "Keep bots out of a public form and keep its mail under control: the descriptor's protect and confirm, Cloudflare Turnstile, the limits on what a form emails, and the form hook in the web app."
---

A form opened with [`public.create`](/guides/public-site/#creating) is open to everyone, and that includes bots. Three things go wrong on a live site:

1. **Bots send the form.** The throttle slows one address down. A bot net has many.
2. **Every submission emails the owner.** A burst buries the real ones.
3. **The form emails whatever address was typed into it**: "we got your message". So anyone can make your site send mail to strangers, until your mail account's limit is spent and its reputation with it.

`protect` deals with the first, `PublicMail` with the other two, and `confirm` is for a list people join.

```json
"public": {
    "create": {
        "fields": ["name", "email", "subject", "message"],
        "protect": { "turnstile": true, "honeypot": true, "minSeconds": 3, "email": "email" }
    }
}
```

Run `nevela generate` after adding it. A form with no `protect` works exactly as before.

## The checks

Laravel makes them in this order, cheapest first, before the form is validated and before anything is stored.

| Check | Turned on by | Refused when |
|---|---|---|
| Honeypot | `"honeypot": true` | A field no person sees has a value. |
| Time taken | `"minSeconds": 3` | The form came back sooner than that, or its token is missing, forged or more than two hours old. |
| Robot check | `"turnstile": true` | Cloudflare, asked by Laravel, doesn't vouch for the visitor. |
| The address | `"email": "<field>"` | Its domain takes no mail, or is a throwaway one (mailinator and some ten thousand like it). |
| One address, many networks | `"email": "<field>"` | That address has sent the form more often than `create.throttle` allows, wherever from. |

Use any of them alone or together. `honeypot` and `minSeconds` cost a visitor nothing and need no account anywhere, so start there.

## What a refused sender is told

| Refused by | Answer |
|---|---|
| The honeypot, a missing or forged token, too fast | **201**, as if it worked. Nothing is stored and no mail is sent. A bot learns nothing to adjust to. |
| The robot check, a form left open too long | **422**: "We couldn't confirm you're not a robot. Please try again." A person can get this, so they are told. |
| The address | **422** on that field, like any validation message. |
| Too many from one address | **429**. |
| The robot check can't be made | **503**. See [below](#when-the-check-cant-be-made). |

So that the first row really is indistinguishable, **a protected form answers 201 with no body**, even where the resource has `read`.

While `APP_DEBUG` is on, a quietly refused request carries an `X-Nevela-Blocked` header naming the reason, so you can see why your own test didn't arrive.

## What was blocked

Every refusal is counted, by resource, reason and day. The resource's page in the dashboard shows the week:

> Blocked this week: 132 (118 robot check, 14 throwaway address)

Without it, a form that is well protected and a form nobody uses look the same from the inside. The same numbers are at `GET /api/_nevela/forms/<slug>` for anyone who may view the resource.

## Setting up Turnstile

[Turnstile](https://www.cloudflare.com/application-services/products/turnstile/) is Cloudflare's robot check. It is free, and most visitors never see a puzzle.

1. In the Cloudflare dashboard, open **Turnstile** and choose **Add widget**.
2. Give it a name, and add the hostnames the form is on: your domain, and `localhost` while you build.
3. Leave the mode on **Managed** and create it.
4. Copy the two keys it shows:

```sh
# apps/api/.env
TURNSTILE_SECRET_KEY=0x4AAAA…

# apps/web/.env.local
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAA…
```

The site key is public and is built into the web app, so rebuild after changing it. The secret key is Laravel's alone. The browser is never trusted about its own check: it gets a token from Cloudflare, and Laravel asks Cloudflare whether that token is good, with the visitor's address the web app [passes on](/guides/public-site/#throttling).

To try it without an account, Cloudflare publishes keys that always pass: site key `1x00000000000000000000AA` with secret `1x0000000000000000000000000000000AA`. The secret `2x0000000000000000000000000000000AA` always fails. They work while you build. In production a form refuses them: they say yes to everyone, which is no check at all.

### Where a check counts

Cloudflare's yes means a person solved a check for your widget. Laravel takes it only if it was also solved **on your site** and **for this form**:

- **The site.** A widget usually lists `localhost` beside the real domain, so the form can be built. Without this, a token solved on someone's own machine could be spent on your live form. The site is the web app's own address (`NEVELA_WEB_URL` in the Laravel app), or what `TURNSTILE_HOSTNAMES` lists:

  ```sh
  # apps/api/.env, only if the form is on other names than NEVELA_WEB_URL's
  TURNSTILE_HOSTNAMES=example.com, shop.example.org
  ```

  A name stands for its subdomains, as it does on the widget: `example.com` accepts `www.example.com`. In development `localhost` and `127.0.0.1` are accepted too. In production they never are, whatever the setting says.
- **The form.** The widget is rendered with the form's name, Cloudflare hands it back, and the two must agree. A token solved for the contact form can't be spent on the newsletter's.

A check refused for the site is counted on its own, as "robot check solved on another site", and written to the log with the name it came from. If that name is yours, the setting is what is wrong.

### When the check can't be made

| | |
|---|---|
| No secret key, in development | The check is skipped, so you can build the form before the keys exist. `nevela status` and the resource's page both say so. |
| No secret key, in production | The form answers **503** to everyone, and `nevela status` is red. A form that asked for the check and quietly went without would be open, and nobody would know. |
| No site to accept a check from, in production | The same: `NEVELA_WEB_URL` is still `localhost` and `TURNSTILE_HOSTNAMES` isn't set. |
| Cloudflare doesn't answer | **503**: "We couldn't check the form just now. Please try again in a moment." Not let through. |

A token is good once. That is why the form in the web app starts the widget over after every attempt: a corrected form sent with the same token would be refused.

## The form in the web app

A hook and a component, so a protected form is a few lines:

```tsx
"use client";

import { PublicFormGuard } from "@/components/public-form-guard";
import { usePublicForm } from "@/hooks/use-public-form";

export function ContactForm() {
  const form = usePublicForm("contact-messages");
  if (form.sent) return <p>Thank you. We will write back.</p>;

  return (
    <form onSubmit={form.submit}>
      <input name="name" />
      <input name="email" type="email" />
      {form.errors.email && <p>{form.errors.email}</p>}
      <textarea name="message" />
      <PublicFormGuard form={form} />
      {form.error && <p>{form.error}</p>}
      <button disabled={form.pending}>Send</button>
    </form>
  );
}
```

| | |
|---|---|
| `form.submit` | Sends each named field of the form, with the token. |
| `form.pending`, `form.sent` | Being sent, and taken. |
| `form.errors` | What is wrong with a field, by its name. |
| `form.error` | What went wrong that isn't about one field: the robot check, too many tries, no connection. |
| `form.again()` | Show the form again after one was sent. |

`<PublicFormGuard>` renders the honeypot and, where the descriptor asks for it and the site key is set, the Turnstile widget. The script is loaded once, the widget is removed when the form leaves the page, and it starts over after each attempt. With no site key set it renders the honeypot only.

The hook works for a form with no `protect` too. Pass `values` to send something other than the fields as typed:

```ts
usePublicForm("orders", { values: (data) => ({ email: data.get("email"), quantity: Number(data.get("quantity")) }) });
```

### Without the web app

The form's token comes from Laravel, and goes back with the submission:

```
GET  /api/public/_nevela/form/contact-messages
→ { "token": "…", "honeypot": "website", "minSeconds": 3, "turnstile": true, "action": "contact-messages" }

POST /api/public/contact-messages
{ "name": "…", "email": "…", "message": "…", "_form": "<token>", "_turnstile": "<Cloudflare's token>" }
```

Ask for the token when the form is shown, not when it is sent: it says when the form was handed out. Render a field named by `honeypot` where no person will reach it, and send it only if it was filled in. Render the Turnstile widget with `action` as its action (`data-action`, or `action` when rendering it yourself): a check made under another name is refused.

## The mail a form causes

Send it through `PublicMail`, from wherever your app reacts to a new record:

```php
use Nevela\Laravel\Forms\PublicMail;

protected static function booted(): void
{
    static::created(function (ContactMessage $message) {
        PublicMail::toVisitor($message->email, new MessageReceived($message));
        PublicMail::toOwner(new NewMessage($message), line: $message->subject, url: "https://app.example.com/dashboard/contact-messages/{$message->id}");
    });
}
```

**To the visitor.** An address is written to at most once an hour and three times a day, counted across every form. Past that the email is dropped, silently, and the record is still saved. Type a stranger's address into the form a thousand times and they get one email. The addresses themselves aren't kept for this, only a fingerprint to count by.

**To the owner.** At most ten notices an hour go out, each as it happens. The rest are held, and one email at the top of the hour names them: "14 more enquiries since 14:05", each with its `line` and a link to its `url`. Nothing is lost either way: every record is in the dashboard.

Both are queued, so they need a queue worker. `nevela dev` runs one. In production run `php artisan queue:work` under your process manager, as for any Laravel app, and add [the scheduler](/guides/deploying/#the-laravel-app) to cron: it sends the hourly digest.

| `config/nevela.php` | Default | |
|---|---|---|
| `public.mail.visitor_per_hour`, `visitor_per_day` | `1`, `3` | How often one address is written to. |
| `public.notify.to` | `NEVELA_NOTIFY_TO`, or the address the app sends from | Who the owner is. |
| `public.notify.max_per_hour` | `10` | Notices sent as they happen, before the rest wait for the digest. |

## Proving an address

For a list people join, the checks above aren't enough: an address can be real, take mail and belong to someone who never asked.

```json
"create": { "fields": ["email"], "confirm": "email" }
```

- The record is saved **unconfirmed**, and one link is emailed to the address. It goes through `toVisitor`, so signing a stranger up a hundred times sends them one email.
- Until the link is followed, the record is left out of the resource's counts, charts and export, and is marked **Not confirmed** in its table. `GET /api/subscribers?filter[confirmed]=true` lists the ones that are.
- An unconfirmed record is removed after 48 hours, by the [nightly run](/guides/trash/).
- Signing up again with an address already on the list answers exactly as the first time, with 201 and no body. The form can't be used to find out who is on the list. Someone still unconfirmed is sent the link again.
- A record added in the dashboard, by a seeder or by an import is confirmed as it is made.

In your own code, write to the confirmed:

```php
Subscriber::confirmed()->each(fn (Subscriber $subscriber) => Mail::to($subscriber->email)->queue(new Newsletter));
```

The link opens `/confirm` in the web app (`app/confirm/page.tsx`, yours to restyle), which hands it to Laravel to check. Adding `confirm` to a resource that already has records writes a migration that marks them all confirmed: they were on the list before anyone was asked.

This is for a newsletter. A contact form doesn't need it.

## The list of throwaway domains

It ships with the package. Services like these come and go, so fetch the current list now and then:

```sh
nevela disposable
```

It is kept in the app's `storage/app/nevela` and used from there. The list is the public-domain one maintained at [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains).
