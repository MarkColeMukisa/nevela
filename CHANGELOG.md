# Changelog

What changed in each version of Nevela. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the version is below 1.0.0, a minor release may include breaking changes; they are listed under "Changed" or "Removed" and marked **Breaking**.

Add a line under "Unreleased" in the same pull request as the change. `pnpm release` moves those lines under a version; see [Releasing](apps/docs/src/content/docs/contributing/releasing.md).

## [Unreleased]

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

[Unreleased]: https://github.com/MarkColeMukisa/nevela/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/MarkColeMukisa/nevela/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/MarkColeMukisa/nevela/compare/v0.1.5...v0.2.0
[0.1.5]: https://github.com/MarkColeMukisa/nevela/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/MarkColeMukisa/nevela/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/MarkColeMukisa/nevela/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/MarkColeMukisa/nevela/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/MarkColeMukisa/nevela/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/MarkColeMukisa/nevela/releases/tag/v0.1.0
