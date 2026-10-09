# Changelog

What changed in each version of Nevela. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the version is below 1.0.0, a minor release may include breaking changes; they are listed under "Changed" or "Removed" and marked **Breaking**.

Add a line under "Unreleased" in the same pull request as the change. `pnpm release` moves those lines under a version; see [Releasing](apps/docs/src/content/docs/contributing/releasing.md).

## [Unreleased]

## [0.7.0] - 2026-10-09

### Added

- **Deleted accounts.** A page under Manage that lists the accounts that were closed, with their roles, when they were closed and by whom. **Restore** opens one again exactly as it was; **Remove for good** erases it. For anyone who may delete users, under the Users screen's rule: only accounts that may do no more than you.
- **Close account**, at the foot of Account → Profile: someone closes their own account with their password. It is signed out everywhere and kept for an administrator to restore. The only administrator can't. `auth.close_account` in `config/nevela.php` switches it off.
- **An email that had an account can't sign up again**, while its account is closed and after it is removed for good. Other spellings of the same mailbox count as the same: capitals, a `+tag`, and at Gmail the dots. After removal only a fingerprint of the address is kept (an HMAC keyed with the app key) and a hint such as `m•••@gmail.com`; **Allow again** on the Deleted accounts page frees it.
- `POST /auth/close`, `GET /_nevela/deleted-accounts`, `POST /_nevela/deleted-accounts/{id}/restore`, `DELETE /_nevela/deleted-accounts/{id}`, `GET /_nevela/blocked-emails` and `DELETE /_nevela/blocked-emails/{id}`.

### Changed

- **Deleting a user closes the account** (`DELETE /_nevela/users/{id}`, and Delete on the Users screen), where it removed the account with its roles and sign-in methods. A closed account can't sign in, is sent no sign-in links or password resets, isn't listed among the users and isn't counted as holding its roles. In an existing app this starts when `nevela migrate` has run the migration that comes with the upgrade; until then deleting removes, as before. Code of your own that lists or counts users sees closed accounts too: start from `ClosedAccounts::open()`. See [Deleted accounts](apps/docs/src/content/docs/guides/deleted-accounts.md).
- `nevela status` counts the users who can sign in without the deleted accounts, and a resource's records without what is in the trash, and says how many of each are being kept.

## [0.6.0] - 2026-10-09

### Added

- **The trash.** A deleted record is kept for 30 days and can be restored. A **Trash** page under Manage lists what has been deleted, a tab per resource, with Restore, Delete forever and Empty. Every delete in the dashboard says where the record is going, and the message that confirms it has an **Undo**, for one row or a whole selection.
- Deleted records are hidden from lists, counts, stats, insights, exports and their own pages. They are removed for good each night by the scheduler, whenever the Trash page is opened, and by the new `nevela trash`. `trash.days` in `config/nevela.php` sets how long they are kept; `null` keeps them until someone removes them.
- Who may use it follows the permission to delete: a generated policy has `restore` and `forceDelete`, and a policy from before this is asked what it says to `delete`.
- `GET /_nevela/trash`, `GET /_nevela/trash/{slug}`, `POST /_nevela/trash/{slug}/{id}/restore`, `DELETE /_nevela/trash/{slug}/{id}` and `DELETE /_nevela/trash/{slug}?confirm={slug}`.

### Changed

- **Deleting a record moves it to the trash**, in the dashboard and over the API (`DELETE /{slug}/{id}`), where it removed the row. Generated models use `Nevela\Laravel\Concerns\Trashable`, which is Laravel's soft delete. In an existing app this starts when `nevela migrate` has run the migration `nevela upgrade` writes for each resource (`add_trash_to_…`); until then delete works as it did. A query of your own that reads a resource's table with `DB::table(…)` sees deleted rows, and a unique value is held until its record is removed for good. See [The trash](apps/docs/src/content/docs/guides/trash.md).
- `nevela upgrade` says so when it finishes on a version older than the newest release, which happens in the few minutes a release takes to reach Composer, and what to run.

## [0.5.3] - 2026-10-08

### Added

- **Insights**, above every resource's table: a panel with a bar chart of records created per day, week or month, and how the records split across each enum and yes/no field. It follows the table's search and filters, so narrowing the list redraws the charts for what is left. Closed until opened, and nothing is counted until then.
- `GET /{slug}/_insights` behind it. Existing apps get it when `nevela upgrade` regenerates their controllers and routes.

## [0.5.2] - 2026-10-08

### Added

- **Add several**, beside New and Import on every resource's list: a grid for typing in several records at once. It opens with five blank rows, ignores the ones left empty, and the button says how many it will create. They are saved together or not at all, and a mistake is shown on its row.
- `POST /{slug}/_bulk` behind it: up to 500 rows a request (`bulk_max`), checked with the rules for creating one and written in a single transaction. Existing apps get the endpoint when `nevela upgrade` regenerates their controllers and routes.

### Changed

- `nevela upgrade` opens with the name drawn large, as `nevela new` and `nevela update` do, says which version the app is on, and ends with the version it is on now.

## [0.5.1] - 2026-10-07

### Added

- The docs home page credits Nevela's creator: why he built it, in his own words, and where to follow him.

### Changed

- A new app's home page says "Built with Nevela (Next.js + Laravel)" in its footer, where it said "Built with Flare". An existing app gets the line on its next `nevela upgrade`, if its home page hasn't been changed.

- `nevela --version` shows what `nevela version` shows: the command's version and how it was installed, and the app's version when you are in one. Piped or captured, it still prints the number alone, for scripts. The docs use `nevela --version`.
- The docs lead with the `nevela` command throughout: `nevela new`, `nevela dev`, `nevela resource` and the rest, where they said `pnpm create nevela`, `php nevela …` and `php artisan nevela:…`. The longer forms still work and are listed once, under "Without the nevela command".

## [0.5.0] - 2026-10-06

### Added

- Roles and permissions, on Grit's model. A permission is `feature.action` (`products.view`, `users.edit`), every resource brings its four, and a role is a set of them. An app starts with three roles: `ADMIN` (everything), `EDITOR` (every resource) and `USER` (nothing beyond their own account). Laravel checks the permission on every request: `$user->can('products.view')`, `Gate::authorize()`, `@can` and `can:` middleware all work.
- A **Users** screen: add, edit, switch off, sign out everywhere and delete, with search and filters by role and status.
- A **Roles** screen: make roles and tick what each allows, on a grid of every permission there is. A section can be granted whole, including what is added to it later.
- The dashboard hides what the signed-in person can't use: resources they can't view leave the sidebar, and buttons appear only with the matching permission.
- Three rules on top of the permissions, enforced by Laravel: nobody hands out more than they hold, nobody changes an account that may do more than they may (so only an administrator changes an administrator's), and the last administrator can't be removed, switched off or demoted.
- Switching an account off: it is kept, signed out everywhere, and refused at sign-in whichever way it comes.
- A new app starts with ten sample users beside the administrator: two editors and eight users, one switched off. `--no-sample-users` leaves them out, and `nevela user --sample` adds them to an app that has none. They are never made in production.
- `nevela user --role=`. The first account in an app is its `ADMIN`.
- Permissions of your own, in `config/nevela.php` under `permissions`.

### Changed

- A generated policy asks for the resource's permission, where it used to return `true`. Existing policies are your files and are not touched.
- Someone who signs up gets the `USER` role (`auth.default_role`, which was unset). Opening sign-up no longer opens your data.
- An account made with `nevela user` after the first, without `--role` and without being asked, is a `USER`. It used to be able to do everything, as every account could.

### Upgrading

- Run `nevela migrate` after `nevela upgrade`. Every user the app already has becomes an `ADMIN`, so nobody loses access; give people narrower roles from the Users screen. Until the migration runs, everyone can still do everything.
- Your policies still say `return true`. To put a resource under permissions, change its policy to `return $user->can('products.view');` and so on. See "Upgrading an app from before 0.5.0" in the docs.

### Fixed

- A request through the dashboard's `/api` route with no session was answered 500 when the browser hadn't asked for JSON. It is answered 401.

## [0.4.3] - 2026-10-06

### Fixed

- `nevela update` did nothing for a `nevela` command installed with pnpm 11, and said it had worked. pnpm 11 keeps a global package's files in its store, so the command took its own install for an npm one and updated a different copy. It now goes by the folder the command was started through as well.
- `nevela update` installs the version it found by number. pnpm holds a version back for a day after release when asked for `@latest`, so within that day it installed the previous one.
- After updating, `nevela update` asks the `nevela` command for its version. If that is still the old one, it says so, and exits with an error, instead of reporting success.
- The notice about several installed copies shows each copy's version and tells you to remove the older ones. It used to say to keep the first on the PATH, which could be the oldest.

## [0.4.2] - 2026-10-06

### Added

- The name, drawn large, at the top of `nevela new`, `nevela update` and `nevela`: the block letters the Laravel installer and Grit use, in a gradient from blue through indigo to pink. It uses whatever colours the terminal has, and stays one plain line in a narrow terminal or when the output goes to a file.
- `nevela version` works anywhere, not only inside an app. It shows the command's version and how it was installed, and inside an app, the app's version beside it.
- `nevela` on its own lists what the command can do. It used to start creating an app. `pnpm create nevela` on its own still does.
- `nevela version` and `nevela update` say so when the command is installed more than once (say with npm and with pnpm), list where, and print what removes the extra copy. The shell only ever runs the first, so updating another looked like an update that did nothing.

### Changed

- `nevela new` without a name asks "What is the name of your app?", and asks again when the answer can't be used (empty, capitals or spaces, or a folder that already exists) instead of stopping.
- `nevela update` reads like Grit's: the current version, "Checking npm for the latest release", then "Already on the latest version" or the update.

### Fixed

- On Windows, every mistake the installer reported straight after starting ended in a crash inside Node (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`) instead of exiting cleanly: `nevela new` with no name where nobody could be asked, a name that can't be used, a folder that already exists. The installer checks npm for a newer version first, and Node on Windows crashes when a program exits just after a `fetch()`. It no longer uses `fetch()`.

## [0.4.1] - 2026-10-05

### Fixed

- Upgrading an app to 0.4.0 left `components/auth/sign-in-form.tsx` behind, and it no longer compiled, so `next build` failed. An upgrade used to leave a file in place when the template dropped it. It now removes such a file when you never changed it, after copying it to the backup, and `upgrade --undo` brings it back. A file you changed is still always kept. An app already upgraded with 0.4.0 has that one file removed by the next upgrade.

## [0.4.0] - 2026-10-05

### Added

- Full authentication, with Flare's screens backed by Laravel. Password sign-in is joined by:
  - **Two-factor:** a code from an authenticator app or by email after the password, with ten backup codes.
  - **Passkeys:** Face ID, Touch ID, Windows Hello or a security key, with no password to type.
  - **Emailed sign-in links and codes.**
  - **Forgot and reset password**, and changing it from the account page.
  - **Email verification**, by a six-digit code or the link that carries it.
  - **Sign-up**, switched off until you set `NEVELA_REGISTRATION=true`. A generated policy lets every signed-in user do everything until you tighten it, so open sign-up on an untouched app would be an open door.
- Account pages at `/dashboard/account`: profile, password, security and devices.
- A profile picture, optimised with the image pipeline's `avatar` profile: a 400×400 square with an 80×80 thumbnail.
- A list of the devices signed in to an account, each with its browser and address, and signing them out. New apps get a `NEVELA_PROXY_SECRET` shared by the dashboard and the API, so that list can't be dressed up by someone calling the API directly.
- `auth` settings in `config/nevela.php` switch each method on or off. `nevela generate` writes them to `apps/web/lib/auth-config.ts`, so the screens offer only what Laravel will accept.
- In development, emailed codes and links are also printed in the terminal running `nevela dev`, because the default mailer sends nothing.

### Changed

- Sign-in attempts are limited to ten a minute per account, not six a minute per address. The dashboard's server makes these calls, so every person arrived from the same address and shared one limit.
- A wrong password now answers 401 with `code: INVALID_EMAIL_OR_PASSWORD`. It was a 422 validation error.
- `GET /auth/me` also returns `emailVerified`, `twoFactorEnabled`, the avatar, and which device is asking.
- The package now requires `lbuchs/webauthn`, which checks passkey signatures.
- Run `nevela migrate` after upgrading: there are new tables for two-factor and passkeys, and columns for the profile picture and a device's browser.

### Fixed

- Signing out did not remove the cookie on a production build served over plain http, because a cookie marked Secure can only be removed by one that is also marked Secure.

## [0.3.0] - 2026-10-04

### Changed

- **Breaking, for the `nevela` command only:** `update` and `upgrade` are now two commands, the same two Grit has. `nevela update`, from anywhere, updates the `nevela` command itself. `nevela upgrade`, inside an app, brings that app to the latest Nevela, which is what `update` did before. Inside an app, `php nevela update`, `pnpm nevela update` and `npx create-nevela update` still upgrade the app, so instructions written for older versions keep working.
- The artisan command is `nevela:upgrade`. `nevela:update` is kept as an alias.

### Added

- `nevela update` updates the installed command with the package manager that installed it: npm, pnpm, yarn or bun.
- The command's help leads with the short forms: `npm install -g create-nevela` once, then `nevela new my-app`, `nevela dev`, `nevela upgrade`.
- Grit's and Flare's ways of writing a field are understood: `image:file:image`, `image:file:[image]`, `category:belongs_to:Category` and `status:enum:draft|live` mean the same as `image:image`, `category:belongsTo(Category)` and `status:enum(draft|live)`.

## [0.2.1] - 2026-10-04

### Fixed

- `nevela update` stopped short of 0.2.0 on every app created so far. Their `composer.json` asks for `"nevela/laravel": "^0.1"`, and below 1.0 that range means 0.1.x only, so Composer kept the old version and the command asked for a manual edit. The update now moves the range to the one that has the newest release (`^0.2`) and says that it did. From an app on 0.1.x, use `npx create-nevela@latest update`: the fix is in the installer, which runs before the app's own older code.

## [0.2.0] - 2026-10-04

### Added

- Relationships. `category:belongsTo(Category)` links a record to one of another resource. It generates the foreign key, the check that the record exists, `$product->category` and `$category->products`, and in the dashboard a picker that searches, the related name in tables, and a parent's page listing its children. Deleting a parent that records are required to belong to answers 409 with how many there are; an optional link is cleared instead.
- Image fields, optimised on upload the way Grit does it. `image:image` takes a picture, turns it the right way up, removes its metadata, scales it to fit, picks the format from the pixels (WebP; lossless when there is transparency to keep) and makes named renditions beside it. A 1.2 MB 4000×3000 photo is stored as 85 KB, with a 22 KB thumbnail. The original is kept privately.
- Image profiles in `config/nevela.php`: `default`, `product`, `avatar` and `cover`, and your own. A field names one with `image:image(product)`.
- File fields for anything else: `manual:file(pdf|document)`. The contents are checked against what the field accepts, and files a browser would run are never stored.
- `PUT /api/_nevela/uploads/{Resource}/{field}` and `GET /api/_nevela/files/{key}`. A record's API response carries a file's address, dimensions and renditions beside its key, as `<field>File`.
- `php nevela seed` fills relations from the records that exist and image fields with placeholder pictures, and names categories like categories.
- The dashboard's upload box, thumbnails and relation picker now work against Laravel, through a new `/api/…` route in the web app that passes the browser's reads and uploads on with the person's token.
- Three guides in the docs: Build a shop, Relationships, and Files and images.

### Changed

- `php nevela update` says when the new version has migrations that have not been run. This one has: the table that records uploads. Run `php nevela migrate` after updating.

### Fixed

- Any request body over 16 KB failed under `php artisan serve` on Windows: Laravel starts PHP there without the temporary folder's location, so PHP had nowhere to buffer it. Nevela now passes it through.

## [0.1.5] - 2026-10-04

### Fixed

- The dashboard reported "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties" on a full page load, with a different `radix-…` id on each account menu. The React bundled with Next.js 16.0.4 loses a component's place in a list when its code arrives a moment after the page starts up, so every id beneath it comes out different in the browser. The dashboard now uses Next.js 16.3.8, which has the fix. `nevela update` moves an existing app to it; run the install command it prints afterwards.
- With the device in dark mode and the dashboard's theme left to follow it, the page the browser built differed from the one the server sent, and React threw the server's away and rendered the dashboard again. The theme button now starts from what the server sent and switches straight after.

### Security

- Next.js 16.0.4 is marked by its maintainers as having a security vulnerability (CVE-2025-66478). 16.3.8 is a patched version.

## [0.1.4] - 2026-10-04

### Added

- `create-nevela --fast` leaves out Laravel's development packages for a quicker install.
- `nevela update` works from any shell and on an app of any age: `npx create-nevela update`, `pnpm nevela update`, or `nevela update` after `npm install -g create-nevela`. It repairs what stops Composer from updating an older app (an exact version pin, or a package installed from the app's own folder), then updates the package and the dashboard. The same goes for `nevela dev`, `status`, `resource` and the rest.
- The dashboard's record, `apps/web/.nevela.json`, now holds a fingerprint of every template file, so an update knows exactly which files you changed without downloading anything to compare.
- `php nevela update` backs up every file before replacing it, saves the new version of any file you had changed to `.nevela/incoming/` for comparison, and records what it did in the history.
- `php nevela update --undo` puts the dashboard back as it was before the last update.
- `php nevela status -v` lists the dashboard files you have changed.

### Changed

- Creating an app is about three times faster on Windows: roughly 2m 30s instead of 7m 40s on the machine it was measured on, and about 1m 35s with `--fast`. Laravel's "optimized autoloader" is turned off in a new app, because building it made antivirus software scan all 9,000 freshly unpacked files; Laravel, Sanctum and Nevela are installed in one Composer run; and the setup steps share one Laravel start-up. Use `composer install --no-dev --optimize-autoloader` in production.
- `create-nevela` fetches and runs its own newest version when the package manager hands it an older one, which pnpm does for a few hours after each release.
- `php nevela update` gets the dashboard from npm, and from the release tag on GitHub when npm does not have the version yet.
- The installer shows package-by-package progress during the long step, and prints commands in the form that works in the shell it was run from.

### Fixed

- `php nevela update` failed with "php: command not found" in Git Bash on Windows with Laravel Herd, where PHP is `php.bat`. The commands above work there.
- `php nevela update` stopped at the dashboard step when a release was on Packagist but not yet on npm.

## [0.1.3] - 2026-10-04

### Added

- `php nevela status`: check the app in one command. It shows the Nevela version, migrations run and pending, how many people can sign in, each resource's record count, and whether the dashboard is reaching this app's API. Problems are marked with the command that fixes them.
- `php nevela version`.
- `php nevela dev` now runs the API and the dashboard itself, and checks the API's port first. If another program has port 8000 it uses the next free one and points the dashboard at it.
- `php nevela resource … --seed` fills the new resource with records in the same command.
- `GET /api/_nevela/ping`, which identifies a Nevela app and which one it is.

### Changed

- New apps start with `php nevela dev`. They no longer get `scripts/dev.mjs`, which always used port 8000. `php nevela update` points an existing app's `dev` script at `php nevela dev`.

### Fixed

- Sign-in failed with only "Sign-in failed. Try again." when another program was already using port 8000, because the dashboard was talking to that program. The message now says so, and `php nevela dev` avoids it.

## [0.1.2] - 2026-10-04

### Added

- `php nevela <command>` from the top of the project, so there is no `cd apps/api` first: `php nevela resource …`, `php nevela seed …`, `php nevela user`, `php nevela update`, `php nevela dev`. The file is written and kept current by `nevela:generate`.
- `php nevela resource` creates the table too. On the artisan command that is the new `--migrate` option.
- `php artisan nevela:update`: update an existing app in one command. It updates `nevela/laravel`, regenerates, and brings the dashboard files you have not changed up to the new version. Files you changed are kept and listed. `--check` shows what would change.
- New apps record which dashboard version they are on, in `apps/web/.nevela.json`.
- `create-nevela` says when a newer installer exists and prints the command to use it. pnpm can serve an older one for about a day after a release.

### Fixed

- Generated files could be written with Windows line endings when the package itself was checked out that way.

## [0.1.1] - 2026-10-04

### Added

- `create-nevela --bundled-package`: use the copy of `nevela/laravel` inside the installer instead of the release on Packagist.

### Changed

- `create-nevela` asks no questions. A new app starts with a starter account, `admin@example.com` / `password`, in its local database, shown at the end and in the app's README.
- `create-nevela` is faster: the dashboard's packages install while Composer creates the Laravel app, and Sanctum and Nevela are installed in one Composer run instead of two.
- New apps no longer get a `routes/api.php`; Nevela registers its own routes. Run `php artisan install:api` if you want one.
- New apps install `nevela/laravel` from Packagist when a release matching the installer's version exists, instead of always carrying a copy in `packages/nevela-laravel`.

### Fixed

- Creating the first user from inside `create-nevela` failed with "The name field is required" on Windows. The installer no longer asks; it creates the starter account itself.
- In a narrow terminal the installer left a half-finished progress line above each completed step.
- On Windows, `create-nevela` wrote the package constraint as an exact `0.1` instead of `^0.1`, so `composer update` would not have picked up later 0.1.x releases.

## [0.1.0] - 2026-10-03

### Added

- `pnpm create nevela my-app`: create a new app, a Laravel API and a Next.js dashboard installed and connected, with one command.
- `php artisan nevela:user`: create someone who can sign in to the dashboard.
- The MIT license, and `nevela/laravel` published from its own repository so Composer can install it.
- `php artisan nevela:resource`: describe a resource once and generate its Laravel model, migration, form request, API resource, controller, policy and routes.
- `php artisan nevela:generate`: regenerate from the descriptors. Only code between the `nevela:generated` markers is rewritten; a file edited inside its markers is skipped and reported.
- `php artisan nevela:seed`: fill a resource with plausible records and print how long it took.
- A REST API in Flare's format: list with paging, sorting, search and filters, read, create, partial update, replace, delete and stats, with validation errors reported per field.
- Token sign-in with Laravel Sanctum: `POST /api/auth/token`, `GET /api/auth/me`, `DELETE /api/auth/token`.
- `apps/web`: Flare's Next.js dashboard backed by the Laravel API, with sign-in, resource tables, forms, detail pages, import and export.
- Web files generated from Laravel: the Flare descriptor, the resource registry and the dashboard pages for each resource.
- A documentation site in `apps/docs`, with a home page, search, light and dark themes and the current version in the header.
- This changelog and a release script, `pnpm release`.
- CI: package tests on PHP 8.3 and 8.4, a generate, migrate and seed run in the Laravel app, a type-check and build of the web app, and a new app created with `create-nevela` and built.

[Unreleased]: https://github.com/MarkColeMukisa/nevela/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/MarkColeMukisa/nevela/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/MarkColeMukisa/nevela/compare/v0.5.3...v0.6.0
[0.5.3]: https://github.com/MarkColeMukisa/nevela/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/MarkColeMukisa/nevela/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/MarkColeMukisa/nevela/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/MarkColeMukisa/nevela/compare/v0.4.3...v0.5.0
[0.4.3]: https://github.com/MarkColeMukisa/nevela/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/MarkColeMukisa/nevela/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/MarkColeMukisa/nevela/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/MarkColeMukisa/nevela/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/MarkColeMukisa/nevela/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/MarkColeMukisa/nevela/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/MarkColeMukisa/nevela/compare/v0.1.5...v0.2.0
[0.1.5]: https://github.com/MarkColeMukisa/nevela/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/MarkColeMukisa/nevela/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/MarkColeMukisa/nevela/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/MarkColeMukisa/nevela/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/MarkColeMukisa/nevela/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/MarkColeMukisa/nevela/releases/tag/v0.1.0
