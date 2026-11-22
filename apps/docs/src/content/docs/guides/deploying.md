---
title: "Deploying"
description: "What each of the two apps needs in production."
---

Nevela is two apps. Deploy each the way you would deploy any Laravel or Next.js app. On Laravel Cloud, follow [Deploying to Laravel Cloud](/guides/laravel-cloud/), which goes through both step by step. On a host that runs the app in one container from a start command (Sevalla, Railway, Fly.io, Render), see also [Deploying to a container host](/guides/container-hosts/).

## The Laravel app

- Use a production database rather than the SQLite file, and run `php artisan migrate --force` on each deploy.
- Commit the generated code. Nothing is generated at deploy time, so the server does not need the web app's folder.
- Check who holds which [role](/guides/policies/). A generated policy asks for a permission; in an app from before 0.5.0 the policies still allow any signed-in user until you change them.
- Install with `composer install --no-dev --optimize-autoloader`. A new app has Composer's optimized autoloader turned off, because building it made creating an app take minutes longer; production should have it, and the flag turns it on.
- If you ever change `APP_KEY`, keep the old one in `APP_PREVIOUS_KEYS`. Beside what Laravel itself needs it for, it is what keeps [blocked emails](/guides/deleted-accounts/#what-is-kept-of-a-removed-account) blocked.
- Run `php artisan config:cache` and `php artisan route:cache` (or `php artisan optimize`) as usual. Nevela's routes are cached with the rest. On 0.33.0 and earlier, leave out `route:cache`: with routes cached, sign-in and public routes failed.
- Keep `bootstrap/cache` writable, as Laravel needs it to be. Nevela keeps a note there of the tables and columns it has found (`nevela-schema.json`), so it doesn't ask the database again on every request. Migrations clear it. If you ever remove a table or column without a migration, run `php artisan optimize:clear`.
- Add Laravel's scheduler to cron: `* * * * * cd /path/to/api && php artisan schedule:run >> /dev/null 2>&1`. It is what empties [the trash](/guides/trash/) of records past their 30 days each night. Without it they go the next time someone opens the Trash page. The same run removes files visitors uploaded through a [public form](/guides/public-site/) and never sent, and people who joined a list and never [confirmed their address](/guides/protecting-forms/#proving-an-address). The scheduler also sends the hourly digest of form notices that were held back, and removes [sign-ins that have ended](/guides/authentication/#how-long-a-sign-in-lasts). On a host with no cron, run `php artisan schedule:work` beside the web server instead: see [the scheduler on a container host](/guides/container-hosts/#the-scheduler).

### Faster, with Octane

[Octane](https://laravel.com/docs/octane) serves the Laravel app from workers that start it once and keep it, where PHP-FPM starts it for every request. In the [benchmark](/benchmarks/) that made Nevela's API 1.4 to 1.8 times as fast on the same CPU, most for single records, least for pages of many.

Nevela works on it as it is. What Nevela keeps for one request (whose roles grant what, the files a page looked up, which tables and columns are there) is let go of when the next one starts, and the same happens at the start of each queued job. To try it with FrankenPHP:

```sh
cd apps/api
composer require laravel/octane
php artisan octane:install --server=frankenphp
php artisan octane:start --server=frankenphp --workers=8
```

- **After each deploy, run `php artisan octane:reload`,** so the workers load the new code. A migration needs nothing more: Nevela reads its note of the tables again on every request, so a column a migration removed is asked about again.
- **Your own code follows Octane's rules:** nothing about one request kept in a static property or a singleton, because the next request finds it there. The [Octane docs](https://laravel.com/docs/octane#dependency-injection-and-octane) list what to look out for.
- **Workers are replaced after 500 requests** by default (`--max-requests`), which keeps a slow leak from growing. The benchmark ran with that default.

## The web app

The web app needs one setting: `NEVELA_API_URL`, the address of the Laravel API including its prefix, for example `https://api.example.com/api`. The Next.js server must be able to reach that address; visitors' browsers do not need to.

A host such as Laravel Cloud gives you the bare address, `https://your-api.laravel.cloud`. Add `/api` to it. Without it, every sign-in fails with "The dashboard can't find the API's sign-in". The web app checks the address and `NEVELA_PROXY_SECRET` once when it starts. It writes what is wrong to its log, with the value to use, and in development shows it on the sign-in page.
In production the token cookie is marked `Secure`, so the web app must be served over HTTPS.

If the app has [public pages](/guides/public-site/), two more things:

- **Caching.** What `laravelPublic()` reads is kept in Next's data cache and revalidated when the dashboard changes a record. That cache has to be shared by every instance of the web app, or one instance will go on showing a page another has revalidated. On one server it is the default; on several, or on a serverless host, give Next a shared cache handler.
- **`NEVELA_PROXY_SECRET`**, the same value in both apps. It is how Laravel tells visitors apart when every request reaches it from the web app's server. Without it one busy visitor uses up everyone's allowance.
- **`NEVELA_TRUSTED_PROXIES`** in the web app, if there isn't exactly one proxy in front of it. See [Throttling](/guides/public-site/#throttling).
- **`TURNSTILE_SECRET_KEY`** in the Laravel app and **`NEXT_PUBLIC_TURNSTILE_SITE_KEY`** in the web app, if a form asks for the [robot check](/guides/protecting-forms/#setting-up-turnstile). Without the secret a form that asks for it answers 503 in production. The site key is built in, so set it before building the web app. A check counts only if it was solved on the site `NEVELA_WEB_URL` names, so that has to be the site's real address (or list the names in `TURNSTILE_HOSTNAMES`).
- **A queue worker** (`php artisan queue:work`) for the Laravel app, if a form sends mail through `PublicMail` or [confirms an address](/guides/protecting-forms/#proving-an-address). That mail is queued.

## Mail

Sign-up codes, sign-in links and password resets are email, so a server needs a way to send it. `nevela new` asks which, and writes it into `apps/api/.env.example`, the settings a server starts from. On your computer `MAIL_MAILER` stays `log`: emails are written to `storage/logs/laravel.log`, and `nevela dev` prints the codes too.

| Choice | On the server |
|---|---|
| Resend | `MAIL_MAILER=resend` and `RESEND_API_KEY` from [resend.com/api-keys](https://resend.com/api-keys). The app has Resend's PHP package (`resend/resend-php`), which Laravel's `resend` mailer needs. |
| Brevo | `MAIL_MAILER=smtp`, `MAIL_HOST=smtp-relay.brevo.com`, `MAIL_PORT=587`, and `MAIL_USERNAME` and `MAIL_PASSWORD`: the SMTP login and key from Brevo's SMTP & API settings. |
| SMTP | `MAIL_MAILER=smtp`, and your provider's `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME` and `MAIL_PASSWORD`. |

Set `MAIL_FROM_ADDRESS` to an address on a domain the provider has verified for you, or mail may be refused as spam. To change provider later, change these settings; for Resend in an app made with another choice, add its package first: `cd apps/api && composer require resend/resend-php`. `deploy:check` names any of these that is missing.

## An app with no dashboard

An app made with `--tier mobile` is the API and a phone app. Its `.env` has `NEVELA_DASHBOARD=false`. Emails then carry codes and no buttons, since there are no dashboard pages to open, and `deploy:check` doesn't ask for `NEVELA_WEB_URL` or `NEVELA_PROXY_SECRET`. Google and GitHub sign-in from the phone come back to the API's own address, as they do in every app.

The phone app has no screen yet for a forgotten password: someone who forgets theirs signs in with an emailed code. On the server, `php artisan nevela:user their@example.com --reset` gives them a new password.

## Checklist

Run `php artisan nevela:deploy:check` on the server after each deploy. It checks most of this list for you, and the dashboard as well. See [nevela deploy:check](/reference/commands/#nevela-deploycheck).

- [ ] Roles and policies reviewed, and the sample users deleted, then removed for good under Deleted accounts
- [ ] `NEVELA_API_URL` points at the production API, with its prefix
- [ ] Both apps served over HTTPS
- [ ] `NEVELA_PROXY_SECRET` set to the same value in both, if anything is public
- [ ] `nevela status` run on the server: it is red where a form's robot check has no secret key
- [ ] With [Google or GitHub sign-in](/guides/authentication/#google-and-github) on: the production callback address registered with each provider, and `php artisan config:clear` after changing `SOCIAL_AUTH_ENABLED` on a server that caches its config
- [ ] `routes/nevela-public.php` read through: it lists everything that is open without signing in
- [ ] At least one user created on the server with `php artisan nevela:user`. The starter `admin@example.com` account is not there, and should not be
