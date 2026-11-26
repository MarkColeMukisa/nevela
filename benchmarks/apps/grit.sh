#!/usr/bin/env bash
# Build the Grit side of the rally: a plain Grit API app with one generated resource, as
# Grit's own harness builds it (github.com/MUKE-coder/grit, benchmarks/grit-bench.sh, MIT).
#
#   ./apps/grit.sh            needs grit $GRIT_VERSION and Go on PATH
#
# The app is scaffold output, so it isn't committed: anyone can make it again, byte for
# byte, from the pinned CLI. One change is made to what Grit generates, and it is the only
# one: its request limits are set to 0 in internal/ratelimit/rules.go, the table Grit says
# is where limits are changed, as Nevela's limits are switched off for the race through
# its settings. k6 is one person at one address, asking hundreds of times a second.
set -euo pipefail
cd "$(dirname "$0")"

GRIT_VERSION="${GRIT_VERSION:-3.581.0}"

command -v grit >/dev/null || { echo "grit isn't on PATH: go install github.com/MUKE-coder/grit/v3/cmd/grit@v$GRIT_VERSION" >&2; exit 1; }
have="$(grit version | awk '{print $NF}')"
if [ "$have" != "$GRIT_VERSION" ]; then
  echo "grit on PATH is $have; the rally is pinned to $GRIT_VERSION: go install github.com/MUKE-coder/grit/v3/cmd/grit@v$GRIT_VERSION" >&2
  exit 1
fi

rm -rf grit-bench
# --api: the race drives HTTP. A web and an admin front end would be built and never asked.
grit new grit-bench --api
(
  cd grit-bench
  # The fields of Grit's harness, column for column what the Laravel and Nevela tables hold.
  grit generate resource Product --fields "name:string,sku:string,description:text,price:float,stock:int,active:bool"
)

# The one change: every rule in Grit's default table switched off (0 is off, by Grit's own
# definition), so the race measures the request path and not the limiter's refusals.
rules=grit-bench/apps/api/internal/ratelimit/rules.go
sed -i -E 's/MaxRequests: [0-9]+,/MaxRequests: 0,/' "$rules"
grep -q 'MaxRequests: [1-9]' "$rules" && { echo "!! a limit in $rules is still on" >&2; exit 1; }

# Grit's image builds the server and its migrations, not the seeder that makes the
# administrator. Built here for Linux, run on the bench network by run.sh.
(cd grit-bench/apps/api && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o ../../../grit-seed ./cmd/seed)

echo "grit $GRIT_VERSION: apps/grit-bench, and apps/grit-seed"
