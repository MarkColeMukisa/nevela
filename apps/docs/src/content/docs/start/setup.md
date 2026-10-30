---
title: "Set up your computer"
description: "What to install before your first Nevela app, in order, on macOS, Windows and Linux, and how to check each step worked."
---

A Nevela app is a Laravel app and a Next.js app, so your computer needs what those two need. You do this once; every app after the first uses the same.

| | Needed for | Version |
|---|---|---|
| **PHP** | the Laravel app, the API | 8.3 or newer |
| **Composer** | installing Laravel and Nevela's Laravel package | any recent |
| **Node.js** | the dashboard and the `nevela` command | 20 or newer |

Nothing else. The database is SQLite, a file inside the app, so there is no database server to install. Git is used if you have it, to start the app's history, and skipped if you don't.

## Check what you have

Open a terminal (Terminal on macOS, PowerShell on Windows) and run:

```sh
php -v
composer -V
node -v
```

Each should print a version: `PHP 8.4.…`, `Composer version 2.…`, `v22.…`. PHP needs to be 8.3 or newer, and Node.js 20 or newer.

Then check that PHP can use SQLite, the database a new app starts with:

```sh
php -m
```

The list should have `pdo_sqlite` in it. Herd has it; on Linux, see [below](#linux) if it is missing.

If all of that is there, you are ready: go to the [Quickstart](/start/quickstart/).

If one says `command not found` (or, on Windows, `is not recognized`), install it below.

## macOS

1. **Install [Laravel Herd](https://herd.laravel.com).** It is free, and it brings PHP, Composer and Node.js, with nothing else to set up. Open it once after installing, so it can finish.
2. **Open a new terminal window.** One that was open before Herd was installed doesn't know about it yet.
3. **Check:** `php -v`, `composer -V`, `node -v`. If `node -v` alone answers `command not found`, run `nvm install 22`, which Herd also brings, or install Node.js from [nodejs.org](https://nodejs.org).

If you use Homebrew and would rather not use Herd, `brew install php composer node` does the same.

## Windows

1. **Install [Laravel Herd](https://herd.laravel.com).** It brings PHP and Composer. Open it once after installing.
2. **Install Node.js**, the LTS version from [nodejs.org](https://nodejs.org), if `node -v` doesn't answer.
3. **Open a new terminal window**, and check: `php -v`, `composer -V`, `node -v`.

Two things that surprise people on Windows:

- **In Git Bash, Herd's `php` is `php.bat`.** Typing `php` there finds nothing. Use the `nevela` command, which knows, or PowerShell, where `php` works.
- **The first app is slow to create.** Windows Defender checks every file Composer unpacks, so the first `nevela new` can take a few minutes, and a download now and then is held back. The installer tries those again by itself. If it still can't, it says so: delete the app's folder and run `nevela new` again, which goes through, because what did arrive is in Composer's cache by then.

## Linux

1. **Install PHP and Composer** with Laravel's one-line installer, on Ubuntu and Debian:

   ```sh
   /bin/bash -c "$(curl -fsSL https://php.new/install/linux)"
   ```

   On other distributions, install PHP 8.3 or newer and Composer from your package manager.
2. **Install Node.js** 20 or newer, from [nodejs.org](https://nodejs.org), your package manager, or [nvm](https://github.com/nvm-sh/nvm).
3. **Open a new terminal**, and check: `php -v`, `composer -V`, `node -v`.

Nevela uses these PHP extensions: `pdo_sqlite` for the database, `gd` for optimising pictures, and `fileinfo` and `exif`. `php -m` lists the ones you have. Without `pdo_sqlite` a new app can't make its database: on Ubuntu and Debian, `sudo apt install php-sqlite3` adds it. Without `gd`, pictures are kept as they were uploaded.

## Then

Go to the [Quickstart](/start/quickstart/). It installs the `nevela` command and creates your first app.

## If something goes wrong

| What you see | What to do |
|---|---|
| `php: command not found` right after installing Herd | Open a new terminal window. |
| `Nevela needs PHP 8.3 or newer. You have 8.2.` | In Herd, choose PHP 8.4 under **PHP**. Elsewhere, install a newer PHP. |
| `Nevela needs Node.js 20 or newer.` | `nvm install 22`, or the LTS from nodejs.org. |
| `npm install -g` fails with `EACCES` (macOS, Linux) | Your Node.js was installed for all users. Use Herd's or nvm's, or `npx create-nevela my-app`. |
| "Composer couldn't download Laravel's packages" (Windows) | Delete the app's folder and run `nevela new` again. If it keeps happening, add the folder to your antivirus's exclusions. |
