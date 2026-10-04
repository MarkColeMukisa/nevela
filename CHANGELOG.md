# Changelog

What changed in each version of Nevela. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the version is below 1.0.0, a minor release may include breaking changes; they are listed under "Changed" or "Removed" and marked **Breaking**.

Add a line under "Unreleased" in the same pull request as the change. `pnpm release` moves those lines under a version; see [Releasing](apps/docs/src/content/docs/contributing/releasing.md).

## [Unreleased]

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

[Unreleased]: https://github.com/MarkColeMukisa/nevela/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/MarkColeMukisa/nevela/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/MarkColeMukisa/nevela/releases/tag/v0.1.0
