---
title: "The mobile app"
description: "An Expo app for iOS and Android that signs in to the same API with the same accounts."
---

`apps/mobile` is an [Expo](https://expo.dev) app: one codebase for iOS and Android. It signs in to the same Laravel API with the same accounts, roles and permissions. People who run the app get a companion to the dashboard; people who sign up as customers get an app of their own: see [Customers and staff](#customers-and-staff).

## Create an app with one

```sh
nevela new my-app --mobile
```

That is `nevela new` with one more folder: the API in `apps/api`, the site in `apps/web`, the admin in `apps/admin`, and the mobile app in `apps/mobile`, named for your app and with its packages installed. `--mobile` is short for `--tier both`, and `nevela new` asks which you want when you leave it off.

For the API and the phone app alone, with no dashboard:

```sh
nevela new my-app --tier mobile
```

With a `nevela` from before 0.36, run `nevela update` first: an older one doesn't know `--tier`.

Everything here works the same, except the parts about the dashboard. Emails carry codes instead of buttons, and there is no blog. See [An app with no dashboard](/guides/deploying/#an-app-with-no-dashboard).

:::note
The mobile app is new in 0.30. `nevela upgrade` does not update `apps/mobile` yet; it leaves the folder alone.
:::

## Run it

Two terminals. In the first, from the top of the project:

```sh
nevela dev
```

```
  API ............................................. http://127.0.0.1:8000
  Site ..................................... http://localhost:3000
  Admin ................................. http://localhost:3001/sign-in
  Mobile app ........... in another terminal: cd apps/mobile && bunx expo start
```

In the second:

```sh
cd apps/mobile
bunx expo start    # npx expo start with npm, pnpm exec expo start with pnpm
```

Then open it one of three ways:

| On | How |
|---|---|
| Your phone | Install **Expo Go** from the App Store or Google Play, and scan the QR code. The phone has to be on the same Wi-Fi as your computer. |
| An Android emulator | Press `a`. Needs Android Studio. |
| An iOS simulator | Press `i`. Needs a Mac with Xcode. |

Sign in with the account you use in the dashboard. A new app's is `admin@example.com`, with the password in the project's `README.md`.

### Why `nevela dev` opens the API to your network

A phone can't reach `127.0.0.1` on your computer: on a phone, that address is the phone. So while a project has an `apps/mobile`, `nevela dev` serves the API on every address your computer has, and anything on the same network can call it for as long as it runs. It says so when it starts. On a network you don't trust, put `NEVELA_MOBILE_PATH=` (with nothing after it) in `apps/api/.env`, and the API stays on your computer. An emulator or simulator still reaches it; a phone does not.

### How the app finds the API

You don't write an address down. The app works it out:

1. `EXPO_PUBLIC_API_URL`, when it is set: `https://api.example.com/api` for a deployed app.
2. While developing, the address the phone already used to reach Expo's server on your computer, with the API's port.
3. On an emulator, the emulator's own name for your computer.

`nevela dev` writes the API's port to `apps/mobile/.env.local` each time it starts (`EXPO_PUBLIC_API_PORT`), so the two still agree when port 8000 was taken and the API moved to 8001. Restart `bunx expo start` after the port changes.

If the sign-in screen says it couldn't reach the server, it names the address it tried. The usual causes are `nevela dev` not running, the phone on a different Wi-Fi (or on mobile data), and a firewall on the computer that blocks the API's port.

## What is in it

| Screen | What it does |
|---|---|
| Sign in | Email and password, with an eye to check what you typed. An emailed code as well, when the API has [that switched on](/guides/authentication/). **Continue with Google** where the API has it. Then the second step for an account that has one: an authenticator app, an emailed code or a backup code. |
| Forgot your password? | From sign-in: the email, then the 6-digit code it was sent with a new password. Every sign-in the account had ends, in case someone else had it, and the phone signs in with the new password, through the second step where the account has one. |
| Create an account | Name, email and password, where the API lets people [sign up](/guides/authentication/#letting-people-sign-up). Where it asks for the email to be proved first, the code it sent. |
| Home | How the app is doing, from what it holds. In an app with a shop it starts with the business: today's orders against the same time last week, how many are waiting, and sales over the last seven days against the seven before ([shop figures](/reference/api/#shop-figures)). Then a card per resource with how many there are, how many were added this week against last, and a chart of the last 30 days. A button to add each kind of record, the latest changes from [the activity log](/guides/notifications/), and the bell. Every number is the API's, asked for with the person's own permissions. |
| Records | Every resource your role may view: search it, open a record, and create, change or delete one where your role allows. See [Your resources](#your-resources). |
| Account | Your profile picture (choose one or take one), your name, your roles, and changing your password. **Close account**, where the API allows it: with your password, it signs you out everywhere and keeps the account for an administrator to restore. App Store and Google Play ask for this in any app where people make an account. For someone who may manage them, **People** and **Roles and permissions** too: see [People and roles](#people-and-roles). |
| Two-step sign-in | Turn on two-step sign-in with an authenticator app (a button that opens the one on the phone, a QR code for one on another device, and the setup key to copy) or with codes by email. Backup codes are shown once, to copy. Make new ones, or turn it off. List your passkeys and remove one. The Google and GitHub accounts connected to yours, and disconnecting one. |
| Activity | The activity log, under Account for whoever holds `activity.view`: who added, changed, deleted, restored or removed which records, newest first, filtered by what was done. The home's **Recent activity** has **See all**. |
| Trash | Under Account for whoever may delete something: each resource's deleted records and how long each has left. Restore one, remove one for good, or empty a resource's trash. See [The trash](/guides/trash/). |
| Settings | Light, dark or the phone's appearance. **Devices**: everywhere the account is signed in, browsers and phones alike; sign one out, or all the others. Under **About**, an administrator is told when a new Nevela release is out. It is for whoever builds the app, so it stays off the home screen. |

Signing in with an emailed link stays in the dashboard for now: it ends at a web address, which a phone app has to be taught to open. What else is the dashboard's alone, or the phone's, and why, is in [Web and phone](/reference/web-and-phone/).

## Customers and staff

One app, two shapes, chosen by role with nothing to set in the app. The API says which role someone who signs up starts with (`NEVELA_DEFAULT_ROLE`, `USER` unless you set it). An account that holds only that role is a **customer**. Anyone who holds another role as well, such as an editor or a role of your own for staff, and every administrator, is **staff**.

| | Customer | Staff |
|---|---|---|
| Tabs | Home, Account, Settings | Home, the tabs in `packages/shared/layout.ts`, then More. In a shop that is **Home, Orders, Catalogue, More**; with no shop, **Home, Records, More** |
| Home | A greeting, the bell, and a list of what the account may browse | The overview: in a shop, today's orders and sales first; then a card per resource with its numbers, the latest activity and quick add |

Staff see the same layout on the phone as in the dashboard, whose sidebar starts with the same tabs under Home. Both read it from `packages/shared/layout.ts` (see [Project structure](/start/project-structure/#packagesshared-what-both-apps-share)). **More** holds everything that isn't a tab: the account (people, roles, activity and the trash where the role allows), every record, security, appearance and About. To choose the tabs yourself, name the resources there: `tabs: ["Booking", "Service"]`. At most three fit between Home and More.

What a customer may see and do is still the [role's permissions](/guides/policies/), checked by Laravel on every request. A new account on a role with no permissions sees "Your account is ready" until someone gives it access.

For a shop that takes orders:

1. Make a `CUSTOMER` role on the dashboard's Roles screen, with the permissions customers need.
2. Set `NEVELA_DEFAULT_ROLE=CUSTOMER` and `NEVELA_REGISTRATION=true` in `apps/api/.env`.
3. Everyone who signs up in the app is now a customer. Staff are made on the Users screen, with their own role.

## People and roles

Whoever may view users or roles (an administrator, or a role you give those permissions) finds **People** and **Roles and permissions** under Account. Everyone else doesn't see them, and Laravel refuses the requests anyway.

- **People**: everyone who can sign in, with a search. Open one to change their name, email or roles, give them a new password, switch their sign-in off, sign them out everywhere, or remove them. **Add a person** makes an account with a password and roles. For whoever may delete people, **Deleted accounts** below the list: the accounts that were closed, by their owners or from People. Restore one as it was, or remove it for good. An address whose account was removed for good can't sign up again until it is allowed, on the same screen.
- **Roles and permissions**: each role, how many permissions it has and how many people hold it. Open one to name it and switch on what it may do to each part of the app: View, Create, Edit and Delete, and an action of a resource's own, such as "Cancel an order". **Make a role** adds one.

It is the same rule as in the dashboard, kept by Laravel: nobody can give a role that allows more than their own, change an account that allows more than theirs, switch off their own account, or take the last administrator's access away. The built-in roles can be edited and not renamed or deleted, and ADMIN always allows everything.

## A shop on the phone

When the app holds an order resource and a catalogue, a customer's home becomes a shop: a grid of what is for sale, a cart, checkout, and **Orders** to follow what they have bought. Nothing is set in the app; it reads the resources.

It is found when:

- one resource has `items` (the order) and another is its lines, with a belongs-to field back to the order;
- the lines point at the catalogue with a belongs-to field, and have a `quantity` or `qty` number;
- the lines' price is the first money field, usually copied from the catalogue (`from: "productId.price"`) so Laravel, not the phone, decides what is paid;
- the customer's role may view the catalogue and create orders.

Checkout asks for the order's own fields the cart can't know (name, phone, how it will be delivered). A `status`, `state` or `stage` field is never asked: give it a default, or send one from `lib/site.ts`:

```ts
shop: {
  send: { status: "pending" },        // fields sent with every order
  checkout: ["customer", "phone"],     // the order's fields to ask, in this order
  available: "inStock",                // a true/false field on the catalogue; only those are shown
  category: "categoryId",              // the field the category chips filter on
},
```

An order with no way to fill its required fields is not a shop, and the customer home stays the plain browse list.

The cart is kept on the phone for each account, holds only a product and a quantity, and is emptied on sign-out. The order goes in one request with its lines; the number, prices and total are Laravel's, and the phone shows what comes back. Money is shown in the app's currency (`NEVELA_CURRENCY`, for example `UGX`), as in the dashboard.

A whole app built this way, from an empty folder, is in the tutorial [A drinks app on the phone](/tutorials/juice-me/).

### Keep customers to their own orders

Name the field that holds the customer's email as the order's `owner`, in `nevela/resources/order.json`, and run `nevela:generate`:

```json
{ "name": "Order", "items": "OrderItem", "owner": "email", "fields": { "email": { "kind": "string", "format": "email" } } }
```

Each customer then sees only their own orders, in the list, on the order's page and in the Orders tab, and an order they place is theirs whatever the phone sends. Staff, who hold `orders.edit`, see every order. The app doesn't ask for the owner field: it is the signed-in person's. See [Which records each person sees](/guides/policies/#which-records-each-person-sees).

### Let people browse before signing in

A shop usually shows what it sells to anyone, and asks them to sign in when they put something in the cart. Give what is sold a [public side](/guides/public-site/), and the app does the same: it opens on the shop for someone who isn't signed in, and on **Add to cart** takes them to sign in (or make an account) and back to what they were adding.

```json
"public": {
    "read": { "fields": ["name", "description", "price", "image", "categoryId", "available"], "throttle": "600,1" }
}
```

Write which records are on the shelf in the model's `scopePublicQuery` (for drinks, `$query->where('available', true)`), and give the category the same, with the fields its chips need, if the shop is narrowed by one. The app reads `GET /api/public/_nevela/resources`, which describes only the resources with a `public.read` and only the fields each opens. It says which of them is sold, and nothing about the order or its lines. An app whose catalogue has no public side opens on signing in, as before.

`"throttle": "600,1"` is ten requests a second. Phones on one Wi-Fi, a campus or an office, reach Laravel from one address and are counted together. The default, 60 a minute, is one student's browsing.

### Fix an order once it is placed

Make the order resource [fixed](/guides/actions/#records-fixed-once-made) (`--fixed`, or `"fixed": true`) and give it [actions that move its status on](/guides/actions/#moving-a-status-on): Accept, Ready, Cancel. Then nobody edits or deletes a placed order, the administrator included, and the order's page on the phone has a button for each step the person may take, where the order is now. A customer can hold **Cancel** without holding **Accept**. Under the buttons is the order's history (who did what, and when), and the customer is told of each step in the bell. [A drinks app on the phone](/tutorials/juice-me/) does all of it.

Without it, anyone who may view orders sees every order. A customer could also post a status of `completed` or a total of their own: the order's status, number and total are for Laravel to set. Give the status a default and let its lines carry the total (`itemsSaved()` on the model sets it), and check as two customers that each sees only their own.

## Sign in with Google

Where the API has Google (or GitHub) [switched on](/guides/authentication/#google-and-github), the sign-in and sign-up screens show **Continue with Google**. Where sign-up is open, a new address gets an account, as it would from the sign-up screen.

It works through the API, not the phone: the app opens Google's page in the phone's browser, Google returns to the API, which asks Google who the person is and hands the browser back to the app with only a reference to the sign-in. The app proves it is the one that began with a secret it kept, so nothing taken off the phone is any use to anyone else. [How it works, and what to register with Google](/guides/authentication/#from-the-mobile-app).

Google only returns to `https` addresses. So the button works against an API that is online with a certificate. While you develop on a phone against `http://192.168.…`, it can't complete: use an `https` tunnel to your computer, or an emulator.

Passkeys are managed from the app, but added and used in the dashboard. A passkey belongs to a website, and an app may only use one that its own domain vouches for: that takes a build of the app signed for your domain, which Expo Go is not.

## Your resources

There is nothing to generate for the mobile app. It asks Laravel what the resources are (`GET /_nevela/resources`, the same descriptions the generator works from) and draws its screens from the answer:

```sh
nevela resource Product --fields="name:string, price:money, category:belongsTo(Category), active:boolean"
```

Pull down on **Records**, or open the app again, and Products is there. That holds for an app already on people's phones too: a new resource or field needs no new build.

| Screen | What it does |
|---|---|
| The list | Search, pull to refresh, and more as you scroll. Each row is the record's title, its picture when it has one, and the two fields that say most about it: a status, an amount, what it belongs to, a date. |
| A record | Every field as a person reads it: money and dates formatted, an enum by its label, a `belongsTo` by the other record's title and a tap away from it. Pictures, and [line items](/guides/line-items/) where the resource has them. Its [actions](/guides/actions/), a button each, for the person who may and while they apply, asking first what they ask; and its history, once one has been done. |
| New and edit | A control per field: a keyboard to suit the format, a switch for a yes or no, a list for an enum, a search of the other resource for a `belongsTo`. A field with [a condition](/concepts/field-types/#a-field-that-only-sometimes-applies) appears when the condition holds. |

What Laravel says about a save is shown where it belongs: a refused field under that field, and "someone else saved this first" when [two people edit the same record](/guides/web-app/#two-people-editing-the-same-record). An edit sends only the fields that changed. Deleting moves a record to [the trash](/guides/trash/), to be restored under Account → Trash or in the dashboard.

A record's files open in the phone's browser, which shows a PDF or a picture and offers to save anything else. A [private file](/guides/images/#private-files) opens by a link the API makes for whoever may view the record, which works for five minutes and only for that file.

Rich text is typed as paragraphs, a blank line between each. Text with formatting the phone can't edit (bold, links, headings, lists) is kept as it is, unless you choose to edit it as plain text, which drops the formatting.

The buttons follow the person's [permissions](/guides/policies/): no `products.create`, no **+**. Laravel checks every request whatever the app shows.

Not from the phone yet:

- **Pictures** are added from the camera or the library, one or several where the field takes several, and sent as they are chosen. Laravel turns them the right way up, removes where they were taken and shrinks them to the field's image profile; lists show the small rendition and a record's page the middle one, kept on the phone once seen.
- **Other files and JSON.** Attaching a PDF, or editing a JSON field, is the dashboard's for now. A resource with a required file that isn't a picture can't be created from the app, and the form says so.
- **Line items.** An order's lines are read on the phone and edited in the dashboard. Editing the order itself leaves its lines as they are.
- **Dates** are typed, as `2026-11-15` or `2026-11-15 14:30`, not picked from a calendar.
- **Actions on the whole list, bulk changes, import and export.** A record's own actions are on its page.

The screens are four files under `src/app/r/[slug]/`, shared by every resource, with the form in `src/components/record-form.tsx`. To give one resource a screen of its own, add it as below and link to it from wherever you like.

## How it talks to Laravel

The dashboard never lets the browser see a token: its server holds it in a cookie and calls Laravel itself. A phone has no server in between, so the mobile app calls Laravel directly:

1. Signing in answers a short-lived token and a refresh token (see [Signing in](/reference/api/#signing-in)).
2. The app keeps both in the phone's Keychain (iOS) or Keystore (Android), where other apps can't read them.
3. Every request carries the token as a `Bearer` header.
4. A token near its end is swapped for a new one before it is used. One that is refused is swapped once and the request sent again. When the sign-in itself has ended, the app goes back to the sign-in screen.

Laravel decides every request exactly as it does for the dashboard: the same validation, the same policies. The phone shows up under **Devices**, by its own name, beside the browsers.

Photos go up as a form (`multipart/form-data`): React Native reads the picture from disk itself, where bytes read into JavaScript first arrive altered on Android. So they meet PHP's form limits, `upload_max_filesize` and `post_max_size`, 2 MB and 8 MB unless `php.ini` says otherwise. The app shrinks a photo larger than 2048 pixels to that size before sending it (`MAX_SIDE` in `src/lib/upload.ts`), which keeps it well under; Laravel shrinks it again to the field's [image profile](/guides/images/). A large picture that can't be shrunk can still go over, and Laravel then answers with a 413 naming the setting to raise. See [Uploading](/guides/images/#uploading).

| File | What it does |
|---|---|
| `src/lib/api.ts` | The only `fetch` to Laravel. Finds the API, adds the token, renews it. |
| `src/lib/auth.tsx` | Who is signed in, and signing in and out. `useAuth()` in any screen. |
| `src/lib/storage.ts` | Where the tokens are kept. |
| `src/lib/resources.tsx` | The resources as Laravel describes them, and what the person may do with each. `useResources()` in any screen. |
| `src/lib/format.ts` | A field's value as a person reads it. |
| `src/lib/theme.ts` | Colours, spacing and type sizes. Light and dark follow the phone. |
| `src/lib/site.ts` | The app's name and tagline. |
| `src/components/ui.tsx` | The pieces screens are built from: `Screen`, `Field`, `Button`, `Card`, `Row`. |
| `src/app/` | The screens. Every file is one, by [Expo Router](https://docs.expo.dev/router/introduction/)'s rules. |

### Call the API from a screen of your own

```tsx
// apps/mobile/src/app/products.tsx
import { Body, Card, Loading, Notice, Row, Screen } from "@/components/ui";
import { api, messageOf } from "@/lib/api";
import { useLoaded } from "@/lib/use-loaded";

interface Product { id: string; name: string; price: number }

const load = () => api.get<{ data: Product[] }>("/products", { sort: "name", perPage: 50 });

export default function Products() {
  const products = useLoaded(load);
  if (products.loading) return <Loading />;
  return (
    <Screen edges={["bottom"]}>
      {products.error ? <Notice>{messageOf(products.error)}</Notice> : null}
      <Card>
        {(products.data?.data ?? []).map((product) => (
          <Row key={product.id} label={product.name} value={String(product.price)} />
        ))}
      </Card>
      {products.data?.data.length === 0 ? <Body muted>No products yet.</Body> : null}
    </Screen>
  );
}
```

Add `<Stack.Screen name="products" options={{ title: "Products" }} />` beside the others in `src/app/_layout.tsx`, inside the signed-in group, and open it with `router.push("/products")`. Every endpoint is in the [REST API reference](/reference/api/).

## Make it yours

- **Name and icon.** `name` in `app.json` is what the phone shows under the icon. The icons are in `assets/images`. Replace them with your own at the same sizes.
- **Colours.** `src/lib/theme.ts` has one set for light and one for dark.
- **Wording.** `src/lib/site.ts`.

## Put it on a phone for real

Expo Go is for developing. To give the app to other people, build it:

1. Tell the app where the deployed API is: `EXPO_PUBLIC_API_URL=https://api.example.com/api`, and it has to be `https`. Store it as an EAS environment variable for the `preview` and `production` environments, on expo.dev under the project's Environment variables, or with `npx eas-cli@latest env:create`. Builds read it through `environment` in `eas.json`, and [updates](#updates-without-a-new-build) through `--environment`, so the two always agree. `.env.local` won't do: it is left out of git, a build in the cloud never sees it, and an update doesn't read it. An app built or updated without the address looks for the API on your computer.
2. Set your own `ios.bundleIdentifier` and `android.package` in `app.json`, such as `com.example.myapp`.
3. Build with [EAS](https://docs.expo.dev/build/introduction/): `npx eas-cli@latest build --platform android` (or `ios`).

`bunx expo start --web` runs the app in a browser, which is handy for a quick look. Think before shipping it: a browser has no keychain, so the tokens sit in the page's storage, where any script on the page can read them. The dashboard is the web app.

When a web version is worth that, for example for iPhone users before you have an Apple developer account, build it for a static host:

```sh
cd apps/mobile
EXPO_PUBLIC_API_URL=https://api.example.com/api bun run export:web
```

Publish `dist/`, with `index.html` as both the index and the error page, so an address inside the app loads directly. `export:web` also moves the icon fonts out of `node_modules` folders inside `dist/`. Hosts that skip such folders when they upload, as Sevalla's static sites do, would otherwise leave every icon an empty box.

## Push notifications

Every notice in the bell is also sent as a push notification to the phones of the people it is for. "Your order JM-0016 is now Ready" arrives with the app closed, and tapping it opens the order. There is nothing to write for it: Laravel sends each one through [Expo's push service](https://docs.expo.dev/push-notifications/overview/) once the request has been answered.

- **When a phone is registered:** when someone signs in on it and allows notifications. The phone belongs to whoever signed in on it last.
- **When it stops getting them:** as soon as that sign-in ends: they sign out, it is revoked from the Devices screen, a new password or a closed account ends it, or it lapses after a while unused or at its time limit. A phone that was signed out with no connection, so the server never heard, stops once its sign-in lapses.
- **Where there are none:** the web version, a simulator, and Expo Go on Android, which has had no remote push since SDK 53. Try them on a build.

To send one with no notice in the bell, call `Push::send` from your own code:

```php
use Nevela\Laravel\Push\Push;

Push::send([$order->user_id], "Your order {$order->number} is ready", 'Collect it at the counter', "/dashboard/orders/{$order->id}");
```

The last argument is where a tap leads: a record's page, written as the dashboard's address. It never throws, and nothing is asked of Expo for people with no phone registered. In an app that upgraded, run `php artisan migrate` first, which makes the `nevela_push_tokens` table.

### What an Android build needs

1. **An EAS project:** `npx eas-cli@latest init` in `apps/mobile`. A push is addressed per project.
2. **Firebase:** make a project at [console.firebase.google.com](https://console.firebase.google.com), add an Android app with your `android.package`, and download `google-services.json` into `apps/mobile`. Set `"googleServicesFile": "./google-services.json"` under `android` in `app.json`. The file holds no secret and is committed.
3. **The FCM V1 key:** in Firebase, under Project settings, Service accounts, make a private key. Upload it with `npx eas-cli@latest credentials`. It is a secret: never commit it.
4. **Your notification icon:** `assets/images/notification-icon.png` is a white silhouette on a transparent background, 96 by 96, and Android draws it in the status bar. The new app's one is Nevela's N. Make yours from your own icon's monochrome layer, and set `color` beside it under `expo-notifications` in `app.json`. It is part of the build, so changing it needs a new one.

An iPhone build needs an Apple developer account. EAS sets up Apple's push key when it builds.

### When a push doesn't arrive

```sh
php nevela push owner@example.com
```

That sends a test push to the person's phones and shows what became of it. Expo's first answer (a ticket) only says Expo took it. Whether Firebase or Apple took it in turn is in the receipt, a few seconds later: a missing or wrong FCM key shows there and nowhere else. If it says they have no phone registered, they may have signed out, which forgets the phone on purpose. Sign in on the phone again and stay signed in.

## Updates without a new build

The app takes over-the-air updates from [EAS Update](https://docs.expo.dev/eas-update/introduction/): new screens, wording and fixes reach phones that have it installed, with no new build to hand out. Set it up once, before the first build you give anyone. A build made without it can never take one.

```sh
cd apps/mobile
npx eas-cli@latest update:configure
```

That adds the project's update address to `app.json`. `eas.json` already gives each build profile its channel: `preview` for builds you share, `production` for the stores. Before the first update, store `EXPO_PUBLIC_API_URL` as an EAS environment variable (step 1 of [Put it on a phone for real](#put-it-on-a-phone-for-real)). An update reads only those, and one published without it leaves every phone that takes it unable to reach the API. Then, after a change:

```sh
bun run update:preview        # or update:production; npm run … in an app made with npm
```

A phone takes the update after one or two launches. An update reaches only builds of the same `version` in `app.json` (`runtimeVersion` is `appVersion`). Anything native needs a new build and a new `version`: the icon, the splash screen, the notification icon, a permission, or a new package with native code.

## Add one to an app you already have

There is no command for it yet. Create a throwaway app with `nevela new scratch --mobile --no-install`, copy its `apps/mobile` into your project, and run your package manager's install in it. The API needs nothing new, but `nevela dev` only opens the API to your network from 0.30, so [upgrade](/guides/updating/) first.
