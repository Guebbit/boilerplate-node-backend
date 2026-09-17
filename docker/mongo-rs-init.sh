#!/usr/bin/env bash
# Initiate the one-node replica set `database` boots with `--replSet rs0`, then wait for it to
# reach PRIMARY before exiting. Run once as a one-shot compose service — `mongo-init.js` cannot do
# this itself: the entrypoint's temporary init-script standalone always runs WITHOUT --replSet, so
# `rs.initiate()` fails there with "not running with --replSet". This script runs against the REAL,
# replSet-enabled mongod instead, after it has already come up.
#
# https://www.mongodb.com/docs/manual/reference/method/rs.initiate/
set -euo pipefail

# `ping` needs no auth even under `--keyFile` (implies `--auth`) — same reason the compose
# healthcheck on `database` can stay unauthenticated. Belt over `depends_on`'s own
# `service_healthy` gate: podman-compose 1.6 does not check a healthcheck the same way Docker
# Compose does, so this loop is what actually blocks until mongod answers.
until mongosh --host database --quiet --eval "db.adminCommand('ping').ok" >/dev/null 2>&1; do
    sleep 1
done

# Idempotent: `rs.status()` throws on an uninitiated set ("no replset config has been received"),
# which is exactly the signal to call `rs.initiate()`. Re-running this script against an
# already-initiated set is then a no-op, same as every other seeder in this repo.
mongosh --host database -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" \
    --authenticationDatabase admin --quiet --eval '
        try {
            rs.status();
            print("[mongo-rs-init] replica set already initiated");
        } catch (e) {
            rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "database:27017" }] });
            print("[mongo-rs-init] replica set initiated");
        }
    '

# `setup`'s own depends_on trusts this exiting 0 only once the set can actually take writes —
# `rs.initiate()` returns before election finishes, so `db:sync`/`access:bootstrap` racing this
# exit would otherwise see a set with no PRIMARY yet.
until mongosh --host database -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASSWORD" \
    --authenticationDatabase admin --quiet --eval 'rs.isMaster().ismaster' 2>/dev/null \
    | grep -q true; do
    sleep 1
done

echo "[mongo-rs-init] database is PRIMARY"
