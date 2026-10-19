#!/bin/sh
# Octane, with FrankenPHP as its server, added to an app build.sh has made. FrankenPHP's
# binary comes with the image, so nothing is downloaded here.
set -eu
cd /app

composer require 'laravel/octane:^2.0' --update-no-dev --no-scripts --no-interaction --no-progress
php artisan package:discover
php artisan octane:install --server=frankenphp --no-interaction

# Octane downloads a FrankenPHP of its own when the image's is older than it needs, and
# that one is built for glibc, not Alpine: it can't start. Stop here instead.
if [ -e frankenphp ]; then
  echo "Octane wanted a newer FrankenPHP than the image has: $(frankenphp version)" >&2
  exit 1
fi
