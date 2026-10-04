---
title: "Configuration"
description: "The settings in config/nevela.php and the web app's environment."
---

## Laravel: config/nevela.php

The package works without a config file. To change a setting, publish it:

```sh
php artisan vendor:publish --tag=nevela-config
```

| Key | Default | Meaning |
|---|---|---|
| `descriptors_path` | `base_path('nevela/resources')` | Where the resource descriptors are kept. |
| `web_path` | `base_path('../web')`, or `NEVELA_WEB_PATH` | The web app's folder. Generated web files are written here. If the folder does not exist, web files are skipped. Set to `null` to never write them. |
| `root_path` | worked out, or `NEVELA_ROOT_PATH` | The top of the project, where the `php nevela` launcher is written. By default two folders up, when the app is at `<project>/apps/<name>`. Set to `false` for no launcher. |
| `prefix` | `api` | The URL prefix for every Nevela route. |
| `middleware` | `['api', 'auth:sanctum']` | Middleware on the resource routes. |
| `auth.enabled` | `true` | Whether Nevela registers the token endpoints. Turn off to provide your own. |
| `auth.token_name` | `nevela-web` | The name given to tokens when the request sends no `deviceName`. |
| `per_page` | `25` | Records per page when a list request does not say. |
| `max_per_page` | `100` | The most a list request may ask for. |
| `uploads.disk` | `public`, or `NEVELA_UPLOADS_DISK` | The disk file and image fields store on. |
| `uploads.url` | none, or `NEVELA_UPLOADS_URL` | The address files are served from, when a CDN or your web server serves the disk. |
| `uploads.originals_disk` | `local`, or `NEVELA_ORIGINALS_DISK` | Where untouched originals of images are kept. |
| `uploads.max_bytes` | 10 MB | The largest file a field takes. |
| `uploads.memory` | `512M` | Memory allowed while an image is optimised. |
| `uploads.profiles` | `default`, `product`, `avatar`, `cover` | How images are optimised. See [Files and images](/guides/images/#profiles). |

### Environment

| Variable | Meaning |
|---|---|
| `NEVELA_WEB_PATH` | Overrides `web_path`. Use it when the web app is not at `../web`. |

### If you change the prefix

Set the same prefix in the web app's `NEVELA_API_URL`. With `'prefix' => 'v1'`, the web app needs `NEVELA_API_URL=http://127.0.0.1:8000/v1`.

### If you raise max_per_page

The dashboard's export reads 100 records per request (`EXPORT_PAGE` in `apps/web/app/dashboard/actions.ts`). It keeps working with a higher limit; raise that constant too if you want faster exports.

## Web app: .env.local

| Variable | Default | Meaning |
|---|---|---|
| `NEVELA_API_URL` | `http://127.0.0.1:8000/api` | Where the Laravel API is, including the prefix. |

Copy `.env.example` to `.env.local` and change it there. The dev server reads the file on its own when it changes.

## Requirements

| | Version |
|---|---|
| PHP | 8.2 or newer for the package. The Laravel app in `apps/api` uses Laravel 13 and needs 8.3 or newer. |
| Laravel | 11, 12 or 13 |
| Node.js | 20 or newer |
| pnpm | The version in the root `package.json` under `packageManager` |
