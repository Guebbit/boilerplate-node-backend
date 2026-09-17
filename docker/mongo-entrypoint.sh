#!/usr/bin/env bash
# Wraps the official image's own entrypoint so the replica set's keyFile exists, with the right
# ownership, before mongod ever reads it — one script rather than a separate one-shot service, so
# nothing but `database` itself needs to depend on it. (An earlier version used a sibling one-shot
# service instead; podman-compose 1.6/libpod refuses to start anything that transitively requires
# an already-exited container, which broke every service two levels below it. A wrapper avoids the
# dependency chain entirely, and is simpler besides.)
#
# Runs as this container's default user, root — before `docker-entrypoint.sh` drops to the image's
# `mongodb` user (uid/gid 999) via `gosu` for the actual mongod process. That's exactly the
# privilege this script needs: `chown` to a uid this shell isn't running as.
set -euo pipefail

KEYFILE=/keyfile-dir/mongo-keyfile

if [ ! -s "$KEYFILE" ]; then
    openssl rand -base64 756 > "$KEYFILE"
    chmod 400 "$KEYFILE"
    chown 999:999 "$KEYFILE"
fi

exec docker-entrypoint.sh "$@"
