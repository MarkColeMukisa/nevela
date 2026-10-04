# Changelog

What changed in each version of Nevela. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the version is below 1.0.0, a minor release may include breaking changes; they are listed under "Changed" or "Removed" and marked **Breaking**.

Add a line under "Unreleased" in the same pull request as the change. `pnpm release` moves those lines under a version; see [Releasing](apps/docs/src/content/docs/contributing/releasing.md).

## [Unreleased]

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

[Unreleased]: https://github.com/MarkColeMukisa/nevela/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/MarkColeMukisa/nevela/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/MarkColeMukisa/nevela/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/MarkColeMukisa/nevela/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/MarkColeMukisa/nevela/releases/tag/v0.1.0
