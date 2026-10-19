#!/usr/bin/env bash
# Measure every app in docker-compose.yml, one at a time, on this machine.
#
#   ./run.sh           each scenario, REPS times, DURATION each, for every app
#   ./run.sh check     each app answers each scenario without a failure; nothing kept
#
#   REPS=3 DURATION=30s VUS=50 APP_CPUS=2 PG_CPUS=1 ./run.sh
#
# Then `node report.mjs` turns results/latest into the table the docs publish.
#
# Needs Docker (with compose) and Node. k6 runs in a container.
set -euo pipefail
cd "$(dirname "$0")"
export MSYS_NO_PATHCONV=1

MODE="${1:-measure}"
if [ "$MODE" = check ]; then
  REPS=1 DURATION=3s WARMUP=1s
  OUT=results/check
fi
REPS="${REPS:-3}"
VUS="${VUS:-50}"
DURATION="${DURATION:-30s}"
WARMUP="${WARMUP:-8s}"
SCENARIOS="${SCENARIOS:-show list write mixed}"
APPS="${APPS:-laravel laravel-auth nevela laravel-auth-octane nevela-octane}"
OUT="${OUT:-results/latest}"
K6_IMAGE=grafana/k6:1.8.2
NETWORK=nevela-bench_default
# Postgres gets more than an app, so the app gives out first and the database is not a
# ceiling every app meets. On a 4-CPU machine (a GitHub runner) that leaves one for k6.
export APP_CPUS="${APP_CPUS:-1}" PG_CPUS="${PG_CPUS:-2}" FPM_WORKERS="${FPM_WORKERS:-8}"

seconds() { echo "${1%s}"; }
case "$DURATION$WARMUP" in *[!0-9s]* | *m*) echo "DURATION and WARMUP are in seconds: 30s" >&2; exit 2 ;; esac

database() { case "$1" in nevela*) echo bench_nevela ;; *) echo bench_laravel ;; esac; }
psql_in() { docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -q -U bench "$@"; }
# As the web server's user, so nothing it writes is out of reach of the app afterwards.
artisan() { local app="$1"; shift; docker compose exec -T -u www-data "$app" php artisan "$@"; }
stop_apps() { docker compose stop laravel laravel-auth nevela laravel-auth-octane nevela-octane >/dev/null 2>&1 || true; }

# Up and answering. Asked from inside the network, as k6 asks.
start_app() {
  local app="$1" i
  stop_apps
  docker compose up -d "$app" >/dev/null 2>&1
  for i in $(seq 1 90); do
    docker run --rm --network "$NETWORK" curlimages/curl:8.22.0 -sf --max-time 3 "http://$app:8080/up" >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "!! $app did not start" >&2
  docker compose logs --tail 40 "$app" >&2
  return 1
}

# Every run starts from the same 10,000 products: the write scenario adds rows for good,
# and a table that grew during one run makes the next one's count slower.
reset_products() {
  local db; db="$(database "$1")"
  psql_in -d "$db" -c "TRUNCATE products;" >/dev/null
  psql_in -d "$db" < seed/products.sql >/dev/null
  [ "$(psql_in -d "$db" -tA -c 'SELECT count(*) FROM products;' | tr -d '[:space:]')" = 10000 ]
}

k6() { # app scenario duration run-name [summary file]
  # As this user, so the results it writes into the folder are this user's.
  docker run --rm --network "$NETWORK" --user "$(id -u):$(id -g)" -v "$PWD:/bench" -w /bench \
    -e BASE="http://$1:8080" -e SCENARIO="$2" -e VUS="$VUS" -e DURATION="$3" \
    -e TOKEN="$(cat "$OUT/token-$1" 2>/dev/null || true)" -e RUN="$4" -e SUMMARY="${5:-}" \
    "$K6_IMAGE" run --quiet k6/bench.js || true
}

# ── Set up ──────────────────────────────────────────────────────────
[ -f seed/products.sql ] && [ -f seed/ids.json ] || node seed/make.mjs
rm -rf "$OUT" && mkdir -p "$OUT"

echo "── building"
docker compose build laravel nevela laravel-auth-octane nevela-octane
docker compose up -d --wait postgres
for db in bench_laravel bench_nevela; do
  psql_in -d bench -c "DROP DATABASE IF EXISTS $db WITH (FORCE);" -c "CREATE DATABASE $db;" >/dev/null
done

echo "── migrating, and a token for the apps that sign in"
start_app laravel
artisan laravel migrate --force --no-ansi >/dev/null
artisan laravel bench:token | tr -d '\r\n' > "$OUT/token-laravel-auth"
start_app nevela
artisan nevela migrate --force --no-ansi >/dev/null
# The first account in a Nevela app is its administrator, as create-nevela makes it.
artisan nevela nevela:user --name=Bench --email=bench@example.com \
  --password="bench-$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')" --no-interaction >/dev/null
artisan nevela bench:token | tr -d '\r\n' > "$OUT/token-nevela"
stop_apps
# The Octane apps use the same databases, and so the same accounts.
cp "$OUT/token-laravel-auth" "$OUT/token-laravel-auth-octane"
cp "$OUT/token-nevela" "$OUT/token-nevela-octane"

# The same table on both sides, or the comparison is of the tables.
for db in bench_laravel bench_nevela; do
  docker compose exec -T postgres pg_dump -U bench --schema-only --no-owner --table=products "$db" \
    | grep -vE '^(--|SET |SELECT pg_catalog|[\](un)?restrict )' | grep -v '^$' > "$OUT/schema-$db.sql"
done
if ! diff -u "$OUT/schema-bench_laravel.sql" "$OUT/schema-bench_nevela.sql"; then
  echo "!! the products tables differ: fix the plain app's migration first" >&2
  exit 1
fi

{
  echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "commit: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "machine: $(docker info --format '{{.NCPU}} CPUs, {{.MemTotal}} bytes, {{.OperatingSystem}}')"
  echo "cpu: $( (grep -m1 'model name' /proc/cpuinfo 2>/dev/null || echo unknown) | sed 's/.*: //')"
  echo "limits: app $APP_CPUS CPUs, postgres $PG_CPUS CPUs, $FPM_WORKERS PHP-FPM or Octane workers"
  echo "load: $VUS virtual users, $DURATION per run, $REPS runs per app and scenario"
  start_app nevela >/dev/null
  echo "php: $(docker compose exec -T nevela php -r 'echo PHP_VERSION;')"
  echo "laravel: $(artisan nevela --version --no-ansi | tr -d '\r')"
  stop_apps
} > "$OUT/environment.txt"
cat "$OUT/environment.txt"

# ── Measure ─────────────────────────────────────────────────────────
# Interleaved: one run of each app in turn, then the next round, so a machine that
# slows down part way through slows everyone down rather than whoever was last.
failed=0
for scenario in $SCENARIOS; do
  echo "── $scenario"
  for rep in $(seq 1 "$REPS"); do
    for app in $APPS; do
      stop_apps
      reset_products "$app" || { echo "!! $app: the products did not reset" >&2; exit 1; }
      start_app "$app"
      k6 "$app" "$scenario" "$WARMUP" warmup >/dev/null   # warm-up: OPcache, the JIT, connections. Not kept.

      # CPU, sampled while the run is going, so it's known what gave out first.
      half=$(( $(seconds "$DURATION") / 2 ))
      ( sleep "$half"
        docker stats --no-stream --format '{{.Name}} {{.CPUPerc}}' | grep -E "nevela-bench-($app|postgres)-1 " ) \
        > "$OUT/$app-$scenario-$rep.cpu" 2>/dev/null &
      sampler=$!

      printf '   %-13s r%s  ' "$app" "$rep"
      k6 "$app" "$scenario" "$DURATION" "r$rep" "$OUT/$app-$scenario-$rep.json" | tail -1
      wait "$sampler" || true

      # Clean: no failed request, and none left unanswered (a run that overran its time).
      problem=$(node -e '
        const s = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
        const failed = s.metrics.failed_requests ? s.metrics.failed_requests.values.rate : 1;
        const overran = s.state.testRunDurationMs > parseInt(process.argv[2], 10) * 1000 + 2000;
        console.log(failed > 0 ? `failed requests (${failed})` : overran ? "requests left unanswered" : "");
      ' "$OUT/$app-$scenario-$rep.json" "$DURATION" 2>/dev/null || echo "no results")
      if [ -n "$problem" ]; then
        echo "   !! $app $scenario: $problem" >&2
        docker compose logs --tail 20 "$app" >&2
        failed=1
      fi
    done
  done
done
stop_apps

if [ "$MODE" = check ]; then
  [ "$failed" = 0 ] && echo "check: every app answered every scenario" || { echo "check: FAILED" >&2; exit 1; }
else
  [ "$failed" = 0 ] || echo "!! some runs had failures; report.mjs marks them" >&2
  echo "done: $OUT. Now: node report.mjs"
fi
