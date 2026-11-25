---
title: "Web and phone"
description: "What the dashboard and the phone app each do, screen by screen, what only one of them does and why, and the check that keeps them together."
---

In an app with both, what the dashboard does has a counterpart on the phone, and the other way round. A mobile-only app (`--tier mobile`) has no dashboard at all, so anything the phone can't do there can't be done, short of `php artisan`. This page is the list: screen by screen, then what only one of them does, and why.

## Screen by screen

| | Dashboard | Phone |
|---|---|---|
| Sign in | Password, emailed code, emailed link, passkey, Google and GitHub, then the second step | Password, emailed code, Google and GitHub, then the second step |
| Create an account, prove the email | Yes | Yes |
| Forgot password | An emailed link | An emailed code |
| Home | Figures, charts, recent activity, the bell | The same, from the same endpoints |
| Records | List, search, filter, sort, create, change, delete, a record's actions and history | The same |
| Files on a record | Upload any kind the field takes, open each | Take or choose pictures, open every file, private ones too |
| Rich text | An editor with bold, links, headings and lists | Typed as paragraphs. Formatting it can't edit is kept, unless you drop it |
| Line items (an order's lines) | Added and changed with the order | Read |
| Profile | Name and picture | Name and picture |
| Password | Change it | Change it |
| Two-step sign-in | Authenticator or emailed codes, backup codes | The same |
| Passkeys | Add and remove | List and remove |
| Connected accounts | Connect Google or GitHub, and disconnect | Disconnect. Signing in with one whose verified email is yours connects it |
| Devices | Every sign-in, browsers and phones; sign one or the others out | The same |
| Close my account | Yes | Yes |
| People | Add, change, switch off, sign out everywhere, delete | The same |
| Deleted accounts | Restore, remove for good, allow a blocked email again | The same |
| Roles and permissions | Make, change, delete | The same |
| Activity | Yes | Yes |
| Trash | Restore, remove for good, empty | The same |
| Notifications | The bell | The bell, and push notifications |
| Add several records at once | The "Add several" grid | No |
| The API page | Yes | No |
| Public site and forms | The pages, the forms and what they turned away | No |
| A customer's own account | On the site, at `/account`: profile, password, sign-in, devices, closing it | The same, under Account and Settings |
| A customer's own records | On the site, at `/account/records`: what their role may view, theirs alone where the resource has an owner. Read only | The same, and created or changed where their role allows |
| A customer's notifications | On the site, at `/account/notifications` | The bell, and push notifications |
| A shop's customer side | Comes with the shop apps (step 13) | Browse, cart, checkout and orders |

## Only in the dashboard, and why

- **Signing in with an emailed link.** The link opens a dashboard page. The phone signs in with an emailed code instead, which works with a dashboard or without one.
- **Adding a passkey, and signing in with one.** A passkey belongs to a website, and a phone app may only use one that its own domain vouches for. That takes a build of the app signed for your domain, which an app run in Expo Go isn't.
- **Connecting Google or GitHub to an account that is signed in.** On the phone, signing in with one whose verified email is the account's connects it.
- **Attaching a file that isn't a picture, and editing JSON.** For now. A resource with a required file of that kind can't be created from the phone, and the form says so.
- **Changing an order's lines.** Comes with the shop apps on the [roadmap](https://github.com/MarkColeMukisa/nevela/issues/144).
- **The "Add several" grid.** Typing many records in rows at once wants a keyboard and a wide screen.
- **The API page, and the public site's forms.** For developers at a desk, and for a website, which the phone has no part in.

## Only on the phone, and why

- **Push notifications.** They go to phones. The dashboard has the bell.
- **Opening a private file by a link.** The phone's browser can't send the app's token, so it asks for a [link that works for five minutes](/guides/images/#private-files). The dashboard's server fetches the file with the token.
- **A shop's customer side**: browsing, a cart and checkout. The site's customer area has the account, records and notifications; the shop comes to it with the shop apps on the [roadmap](https://github.com/MarkColeMukisa/nevela/issues/144).
- **Creating and changing records as a customer.** The site's customer area reads them; the phone also creates and changes them where the role allows.

## How it stays this way

Every route Nevela's API has is in `scripts/parity.json` in the repository, a line each: `"both"`, or which side uses it and why the other has none. So is every kind of field, with whether the phone can fill it. Two tests keep the list true:

- `apps/api/tests/Feature/ParityTest.php` reads Laravel's routes. A route added to Nevela fails it until its line is written, and a line for a route that has gone fails it too.
- `scripts/parity.test.mjs` reads both apps' code. A route said to be used by an app must be named in that app's code, and one said to be the dashboard's alone must not be named in the phone's, or the other way round.

So a dashboard feature can't ship without its phone counterpart, or a line saying why it has none. Both run in CI.
