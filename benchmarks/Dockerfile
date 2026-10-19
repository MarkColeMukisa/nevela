# One image recipe for every app here, so that what differs between them is the app.
#
# Production shape, as a Laravel app is deployed: nginx and PHP-FPM, OPcache with its JIT,
# Composer's production autoloader, and Laravel's caches built when the container starts.
# Not `artisan serve`, which is a one-request-at-a-time development server, and not
# Octane, which most Laravel apps don't run (it would be labelled as such if it were here).
#
# Built from the repository root (docker-compose.yml does this), so the Nevela app uses
# the package as it is in this checkout:
#
#   docker build -f benchmarks/Dockerfile --build-arg APP=nevela .
FROM php:8.4-fpm-alpine

RUN apk add --no-cache nginx postgresql-dev \
    && docker-php-ext-install pdo_pgsql opcache bcmath \
    && rm -rf /var/cache/apk/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY benchmarks/docker/php.ini /usr/local/etc/php/conf.d/zz-bench.ini
COPY benchmarks/docker/fpm.conf /usr/local/etc/php-fpm.d/zz-bench.conf
COPY benchmarks/docker/nginx.conf /etc/nginx/nginx.conf
COPY benchmarks/docker/entrypoint.sh /usr/local/bin/bench-entrypoint

# The skeleton every app starts from, at one fixed version.
ARG LARAVEL=13.11.0
RUN composer create-project laravel/laravel /app ${LARAVEL} --no-install --no-scripts --no-interaction --no-progress --prefer-dist
WORKDIR /app

COPY packages/laravel /nevela-laravel
COPY benchmarks/apps /bench

ARG APP
RUN test -n "${APP}" || { echo "build with --build-arg APP=laravel|nevela"; exit 1; } \
    && sh /bench/${APP}/build.sh \
    && php /bench/prepare.php ${APP}

# The classmap is built here, with the app's own classes present (generated or written
# by hand), and nothing outside it is looked for.
RUN composer dump-autoload --no-dev --optimize --classmap-authoritative --no-interaction \
    && rm -f .env \
    && chmod +x /usr/local/bin/bench-entrypoint \
    && chown -R www-data:www-data storage bootstrap/cache

ENV FPM_WORKERS=16
EXPOSE 8080
ENTRYPOINT ["bench-entrypoint"]
