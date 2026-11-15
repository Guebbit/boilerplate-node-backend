#!/bin/sh
# Keeps /app/node_modules in step with package-lock.json for the dev compose services.
#
# Why: compose mounts /app/node_modules as a volume that outlives the container, so it keeps
# the install from the day it was created. A dependency added later is missing until this runs.
#
# How: sha256 of the lockfile, compared with a stamp kept inside node_modules.
#   match         -> nothing to do
#   no / old stamp -> `npm ci` (the same install the dev image runs), then write the stamp
#
# Callers: the `app` and `cron` services in docker-compose.yml, and docker/Dockerfile.
set -eu

lock_file=/app/package-lock.json
stamp_file=/app/node_modules/.package-lock.sha256

current=$(sha256sum "$lock_file" | cut -d ' ' -f 1)
recorded=$(cat "$stamp_file" 2>/dev/null || true)

if [ "$current" = "$recorded" ]; then
  exit 0
fi

echo "ensure-deps: package-lock.json changed, running npm ci"
cd /app
# The cron service sets NODE_OPTIONS for its app code; install scripts must not inherit it
# (the image build sets none).
unset NODE_OPTIONS
npm ci
echo "$current" > "$stamp_file"
