---
title: "The site and the admin"
description: "Two web apps on one API, the triple tier: the public site and customer area, and the staff's admin. Who goes where, what each asks of people, and how to deploy and close off the admin."
---

A new app has two web apps on one API, as a serious product does: `example.com`, where customers browse, sign in and look after their account, and `admin.example.com`, where staff run the place. A bank is the example. Nevela calls it the triple tier.

| | The site (`apps/web`) | The admin (`apps/admin`) |
|---|---|---|
| Who it is for | Customers, and anyone browsing | Staff |
| What is in it | The public pages, the blog, sign-in (and sign-up, [where switched on](/guides/authentication/#letting-people-sign-up)), and the customer area at `/account` | The dashboard: records, people and roles, activity, the trash |
| Locally | http://localhost:3000 | http://localhost:3001 |

Both are made from one template. The site leaves out the dashboard, so customers never download its code. The admin leaves out the public pages and sign-up. `apps/web/nevela-split.json` in the template lists what each leaves out, and [`nevela upgrade`](/guides/updating/) leaves the same files out of each when it brings them up to date.

`nevela new` makes both by default. `--tier admin` makes the admin alone, for an internal tool with no public site. An app made before 0.41 keeps its one web app, which does both; see [Splitting an app you already have](#splitting-an-app-you-already-have).

## Staff and customers

One rule decides, in the API, and every app goes by it:

- An account that holds only the role people sign up with (`NEVELA_DEFAULT_ROLE`, `USER` unless you set it) is a **customer**.
- Anyone who holds another role as well, and every administrator, is **staff**.

`GET /api/auth/me` says which (`staff`). It decides only what each app shows. What anyone may do is still their [permissions](/guides/policies/), checked by Laravel on every request.

- **A customer who signs in to the admin** is kept to their own account's pages there, with a link to the site. Nothing of the dashboard shows.
- **Staff who sign in to the site** see their account at `/account`, with a link to open the admin.

## The customer area

At `/account` on the site, a customer has what the phone's customer app has:

- **Profile, password, security and devices**: their picture and name, two-step sign-in, passkeys, connected Google and GitHub accounts, every device they are signed in on, and closing the account.
- **Records**, at `/account/records`: each resource their role may view, and its records. Where a resource has an [owner](/guides/mobile-app/#a-shop-on-the-phone), a customer sees their own and nobody else's: Laravel narrows every list and answers "not found" for anyone else's record. Read only on the site.
- **Notifications**, at `/account/notifications`: what the bell on the phone shows.

A link Laravel stored for the dashboard, in a notice or an older email, leads to the same thing on the site: `/dashboard/orders/7` to `/account/records/orders/7`, an account page to `/account`.

## What the admin asks of staff

The admin is stricter than the site, and none of it falls on customers:

- **Two-step sign-in.** Staff without it on see only their account's security page in the admin, until they turn it on. Required in production by default. `NEVELA_STAFF_TWO_FACTOR=true` asks for it on your computer too, and `false` never does.
- **Shorter sign-ins.** A sign-in to the admin ends 12 hours after it began, however busy, so staff sign in again each working day (`NEVELA_SESSION_ADMIN_ABSOLUTE`, in minutes). The admin also signs out after a while with nothing done. Sign-ins to the site and the phone keep the app's own limits.
- **Stricter headers.** The admin is never shown inside another site's frame, posts forms only to itself, and doesn't send the address of the page someone came from on to other sites.

## Emails and links

The API knows both addresses: `NEVELA_WEB_URL` (the site) and `NEVELA_ADMIN_URL` (the admin). Each web app says which it is on every request.

- **A link someone asked for** (a sign-in link, a verification email, a password reset) goes to the app they asked from.
- **With no place asked for**, a customer lands on their account on the site, and staff on the dashboard.
- **A link to a dashboard page** is always on the admin.
- **`nevela user --link`** prints a link to the admin for staff, and to the site for a customer.

## Deploying both

Each web app is deployed on its own, from the same repository: `apps/web` and `apps/admin`, beside the API from `apps/api`. [Deploying to Laravel Cloud](/guides/laravel-cloud/) goes through all three.

| Where | Setting | Value |
|---|---|---|
| The API | `NEVELA_WEB_URL` | The site's address: `https://example.com` |
| The API | `NEVELA_ADMIN_URL` | The admin's address: `https://admin.example.com` |
| The API, the site and the admin | `NEVELA_PROXY_SECRET` | One value, the same in all three |
| The site and the admin | `NEVELA_API_URL` | The API's address with `/api` |
| The site | `NEVELA_ADMIN_URL` | The admin's address, for staff's link to it |
| The admin | `NEXT_PUBLIC_SITE_URL` | The site's address, where a customer who signs in to the admin is sent. Set it where the admin is built, before building: it is written into the app then |

With Google or GitHub sign-in, register both callback addresses with each provider: `https://example.com/api/auth/oauth/google/callback` and `https://admin.example.com/api/auth/oauth/google/callback`. A passkey belongs to the app it was made on.

`php artisan nevela:deploy:check` checks both apps: that each answers at its address as the app it should be, shares the secret and reaches the API, and that the admin sends customers to the site. It says what the admin asks of staff as well.

### Closing the admin off

The admin is an app of its own on an address of its own, so it can be closed to everyone but staff before a request reaches it, with nothing changed in the app:

- **An allow-list of addresses**, at the host or the load balancer: the office, and the VPN.
- **A VPN**, with the admin reachable only from inside it.
- **[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/)** in front of `admin.example.com`, asking for a work email or a login with your company's identity provider first.

Each web app calls the API from its own server, so closing the admin off changes nothing for the site or the phone app.

## Splitting an app you already have

An app made before 0.41 has one web app in `apps/web` that is both the site and the dashboard. It keeps working as it is, and `nevela upgrade` never splits it. To split it:

1. **Check who is staff.** Staff are anyone with a role besides the sign-up role (`NEVELA_DEFAULT_ROLE`). If your staff hold only that role, with permissions added to it, the admin will treat them as customers. Give them a role of their own first, on the Roles screen, and keep the sign-up role for customers.
2. **Copy the web app.** `cp -r apps/web apps/admin`, then in `apps/admin/package.json` give it a name of its own, such as `my-app-admin`.
3. **Say which is which.** In `apps/web/.nevela.json` add `"app": "site",` beside `"template"`, and in `apps/admin/.nevela.json` add `"app": "admin",`.
4. **Take out what each leaves out.** The lists are in `apps/web/nevela-split.json`. Delete those files from each app, and `nevela-split.json` from both. `nevela upgrade` then keeps them out.
5. **Settings.** Add `NEVELA_ADMIN_URL=http://localhost:3001` to `apps/api/.env` and to `apps/web/.env.local`. Copy `apps/web/.env.local` to `apps/admin/.env.local`, and add `NEXT_PUBLIC_SITE_URL=http://localhost:3000` to it.
6. **Generate and run.** `php nevela generate` writes the dashboard's pages into the admin from now on. `php nevela dev` runs the site on 3000 and the admin on 3001.

Then deploy the admin as a new app, as above, and staff sign in there.
