---
title: "Deploying"
description: "What each of the two apps needs in production."
---

Nevela is two apps. Deploy each the way you would deploy any Laravel or Next.js app.

## The Laravel app

- Use a production database rather than the SQLite file, and run `php artisan migrate --force` on each deploy.
- Commit the generated code. Nothing is generated at deploy time, so the server does not need the web app's folder.
- Check who holds which [role](/guides/policies/). A generated policy asks for a permission; in an app from before 0.5.0 the policies still allow any signed-in user until you change them.
- Install with `composer install --no-dev --optimize-autoloader`. A new app has Composer's optimized autoloader turned off, because building it made creating an app take minutes longer; production should have it, and the flag turns it on.
- If you ever change `APP_KEY`, keep the old one in `APP_PREVIOUS_KEYS`. Beside what Laravel itself needs it for, it is what keeps [blocked emails](/guides/deleted-accounts/#what-is-kept-of-a-removed-account) blocked.
- Run `php artisan config:cache` and `php artisan route:cache` as usual. Nevela's routes are cached with the rest.
- Add Laravel's scheduler to cron: `* * * * * cd /path/to/api && php artisan schedule:run >> /dev/null 2>&1`. It is what empties [the trash](/guides/trash/) of records past their 30 days each night. Without it they go the next time someone opens the Trash page. The same run removes files visitors uploaded through a [public form](/guides/public-site/) and never sent, and people who joined a list and never [confirmed their address](/guides/protecting-forms/#proving-an-address). The scheduler also sends the hourly digest of form notices that were held back.

## The web app

The web app needs one setting: `NEVELA_API_URL`, the address of the Laravel API including its prefix, for example `https://api.example.com/api`. The Next.js server must be able to reach that address; visitors' browsers do not need to.

In production the token cookie is marked `Secure`, so the web app must be served over HTTPS.

If the app has [public pages](/guides/public-site/), two more things:

- **Caching.** What `laravelPublic()` reads is kept in Next's data cache and revalidated when the dashboard changes a record. That cache has to be shared by every instance of the web app, or one instance will go on showing a page another has revalidated. On one server it is the default; on several, or on a serverless host, give Next a shared cache handler.
- **`NEVELA_PROXY_SECRET`**, the same value in both apps. It is how Laravel tells visitors apart when every request reaches it from the web app's server. Without it one busy visitor uses up everyone's allowance.
- **`NEVELA_TRUSTED_PROXIES`** in the web app, if there isn't exactly one proxy in front of it. See [Throttling](/guides/public-site/#throttling).
- **`TURNSTILE_SECRET_KEY`** in the Laravel app and **`NEXT_PUBLIC_TURNSTILE_SITE_KEY`** in the web app, if a form asks for the [robot check](/guides/protecting-forms/#setting-up-turnstile). Without the secret a form that asks for it answers 503 in production. The site key is built in, so set it before building the web app.
- **A queue worker** (`php artisan queue:work`) for the Laravel app, if a form sends mail through `PublicMail` or [confirms an address](/guides/protecting-forms/#proving-an-address). That mail is queued.

## Checklist

- [ ] Roles and policies reviewed, and the sample users deleted, then removed for good under Deleted accounts
- [ ] `NEVELA_API_URL` points at the production API, with its prefix
- [ ] Both apps served over HTTPS
- [ ] `NEVELA_PROXY_SECRET` set to the same value in both, if anything is public
- [ ] `nevela status` run on the server: it is red where a form's robot check has no secret key
- [ ] `routes/nevela-public.php` read through: it lists everything that is open without signing in
- [ ] At least one user created on the server with `php artisan nevela:user`. The starter `admin@example.com` account is not there, and should not be
