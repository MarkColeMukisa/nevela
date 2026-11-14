---
title: "The mobile app"
description: "An Expo app for iOS and Android that signs in to the same API with the same accounts."
---

`apps/mobile` is an [Expo](https://expo.dev) app: one codebase for iOS and Android. It is a companion to the dashboard for the people who run the app, not a shop front for customers. It signs in to the same Laravel API with the same accounts, roles and permissions.

## Create an app with one

```sh
nevela new my-app --mobile
```

That is `nevela new` with one more folder: the API in `apps/api`, the dashboard in `apps/web`, and the mobile app in `apps/mobile`, named for your app and with its packages installed.

:::note
The mobile app is new in 0.30. This first version signs you in and looks after your account. Screens for your resources are next. `nevela upgrade` does not update `apps/mobile` yet; it leaves the folder alone.
:::

## Run it

Two terminals. In the first, from the top of the project:

```sh
nevela dev
```

```
  API ............................................. http://127.0.0.1:8000
  Dashboard ............................... http://localhost:3000/sign-in
  Mobile app ........... in another terminal: cd apps/mobile && npx expo start
```

In the second:

```sh
cd apps/mobile
npx expo start
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

`nevela dev` writes the API's port to `apps/mobile/.env.local` each time it starts (`EXPO_PUBLIC_API_PORT`), so the two still agree when port 8000 was taken and the API moved to 8001. Restart `npx expo start` after the port changes.

If the sign-in screen says it couldn't reach the server, it names the address it tried. The usual causes are `nevela dev` not running, the phone on a different Wi-Fi (or on mobile data), and a firewall on the computer that blocks the API's port.

## What is in it

| Screen | What it does |
|---|---|
| Sign in | Email and password. An emailed code as well, when the API has [that switched on](/guides/authentication/). Then the second step for an account that has one: an authenticator app, an emailed code or a backup code. |
| Home | The dashboard's [bell](/guides/notifications/): what has happened since you last looked, and for an administrator, what needs attention in the app. |
| Account | Your name, roles, and changing your password. |
| Settings → Devices | Everywhere the account is signed in, browsers and phones alike. Sign one out, or all the others. |

Signing in with Google, GitHub, a passkey or an emailed link stays in the dashboard for now. Each of those ends at a web address, which a phone app has to be taught to open.

## How it talks to Laravel

The dashboard never lets the browser see a token: its server holds it in a cookie and calls Laravel itself. A phone has no server in between, so the mobile app calls Laravel directly:

1. Signing in answers a short-lived token and a refresh token (see [Signing in](/reference/api/#signing-in)).
2. The app keeps both in the phone's Keychain (iOS) or Keystore (Android), where other apps can't read them.
3. Every request carries the token as a `Bearer` header.
4. A token near its end is swapped for a new one before it is used. One that is refused is swapped once and the request sent again. When the sign-in itself has ended, the app goes back to the sign-in screen.

Laravel decides every request exactly as it does for the dashboard: the same validation, the same policies. The phone shows up under **Devices**, by its own name, beside the browsers.

| File | What it does |
|---|---|
| `src/lib/api.ts` | The only `fetch` to Laravel. Finds the API, adds the token, renews it. |
| `src/lib/auth.tsx` | Who is signed in, and signing in and out. `useAuth()` in any screen. |
| `src/lib/storage.ts` | Where the tokens are kept. |
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

1. Tell the build where the deployed API is: `EXPO_PUBLIC_API_URL=https://api.example.com/api`, and it has to be `https`. Set it in the build's own environment, such as `env` under the build profile in `eas.json`. `.env.local` won't do: it is left out of git, so a build in the cloud never sees it, and the app would look for the API on your computer.
2. Set your own `ios.bundleIdentifier` and `android.package` in `app.json`, such as `com.example.myapp`.
3. Build with [EAS](https://docs.expo.dev/build/introduction/): `npx eas-cli@latest build --platform android` (or `ios`).

`npx expo start --web` runs the app in a browser, which is handy for a quick look. Don't ship that: a browser has no keychain, so the tokens sit in the page's storage, where any script on the page can read them. The dashboard is the web app.

## Add one to an app you already have

There is no command for it yet. Create a throwaway app with `nevela new scratch --mobile --no-install`, copy its `apps/mobile` into your project, and run your package manager's install in it. The API needs nothing new, but `nevela dev` only opens the API to your network from 0.30, so [upgrade](/guides/updating/) first.
