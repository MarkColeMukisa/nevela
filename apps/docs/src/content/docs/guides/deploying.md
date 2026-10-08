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
- Run `php artisan config:cache` and `php artisan route:cache` as usual. Nevela's routes are cached with the rest.
- Add Laravel's scheduler to cron: `* * * * * cd /path/to/api && php artisan schedule:run >> /dev/null 2>&1`. It is what empties [the trash](/guides/trash/) of records past their 30 days each night. Without it they go the next time someone opens the Trash page.

## The web app

The web app needs one setting: `NEVELA_API_URL`, the address of the Laravel API including its prefix, for example `https://api.example.com/api`. The Next.js server must be able to reach that address; visitors' browsers do not need to.

In production the token cookie is marked `Secure`, so the web app must be served over HTTPS.

## Checklist

- [ ] Roles and policies reviewed, and the sample users deleted
- [ ] `NEVELA_API_URL` points at the production API, with its prefix
- [ ] Both apps served over HTTPS
- [ ] At least one user created on the server with `php artisan nevela:user`. The starter `admin@example.com` account is not there, and should not be
