#!/bin/sh
# Octane, with FrankenPHP as its server, added to an app build.sh has made. FrankenPHP's
# binary comes with the image, so nothing is downloaded here.
set -eu
cd /app

composer require 'laravel/octane:^2.0' --update-no-dev --no-scripts --no-interaction --no-progress
php artisan package:discover
php artisan octane:install --server=frankenphp --no-interaction
