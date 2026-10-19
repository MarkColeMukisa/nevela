#!/bin/sh
# Plain Laravel: the skeleton, Sanctum, and a products API written by hand (files/).
set -eu
cd /app

composer require --no-update 'laravel/sanctum:^4.0'
composer install --no-dev --no-scripts --no-interaction --no-progress --prefer-dist

cp .env.example .env
php artisan key:generate --force
php artisan package:discover
php artisan vendor:publish --tag=sanctum-migrations

cp -R /bench/laravel/files/. /app/
