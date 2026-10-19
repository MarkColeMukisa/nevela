#!/bin/sh
# As entrypoint.sh: Laravel's caches from the environment the container is given, then
# Octane on FrankenPHP in place of nginx and PHP-FPM.
set -e
cd /app

php artisan optimize --no-ansi >/dev/null

exec php artisan octane:start --server=frankenphp --host=0.0.0.0 --port=8080 \
  --workers="${OCTANE_WORKERS}" --max-requests="${OCTANE_MAX_REQUESTS}" --no-interaction
