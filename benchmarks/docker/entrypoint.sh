#!/bin/sh
# Laravel's caches (config, routes, events, views) are built here, at start, from the
# environment docker-compose.yml gives the container, as a deployment's release step
# does. Built into the image, they would hold whatever environment the build had.
set -e
cd /app

php artisan optimize --no-ansi >/dev/null
chown -R www-data:www-data storage bootstrap/cache

php-fpm --daemonize
exec nginx -g 'daemon off;'
