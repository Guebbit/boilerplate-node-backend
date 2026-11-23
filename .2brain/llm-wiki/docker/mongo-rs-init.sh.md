---
source: docker/mongo-rs-init.sh
source_sha256: c3378d2ee5b607e5725733d0af8dceea107e40442dad7dfd343c7a0e57e31f27
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T01:30:52.420808+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/mongo-rs-init.sh

## Purpose
A one-shot Bash script, run as a compose service, that initiates the single-node MongoDB replica set `rs0` on the already-running `database` service and blocks until it is PRIMARY. It exists because `mongo-init.js` cannot do this. The entrypoint's temporary init-script mongod runs without `--replSet`, so `rs.initiate()` fails there.

## Key elements
- **`TLS_OPTS`**: `--tls --tlsCAFile /ca-dir/mongo-ca.crt`. `database` requires TLS, and this container reaches it over the compose network using the CA cert from the read-only `/ca-dir` mount.
- **`AUTHENTICATE`**: a mongosh snippet prepended to `--eval` scripts. It reads the root password from `/run/secrets/mongo_root_password` and authenticates against `admin` as the user named by the `MONGO_ROOT_USER` environment variable. The password never appears in `ps` or `/proc/<pid>/cmdline`.
- **Ping loop**: polls `db.adminCommand('ping')` unauthenticated until mongod answers.
- **Idempotent initiation**: `rs.status()` succeeds if the set is already initiated. If it throws, the script calls `rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'database:27017' }] })`.
- **PRIMARY wait loop**: polls `rs.isMaster().ismaster` until `grep -q true` matches, then prints `[mongo-rs-init] database is PRIMARY`.

## Relationships
No graph neighbors are listed, so no file-level dependencies are recorded. The comments refer to other parts of the setup by name:
- `database` service: the mongod being initialized, which runs with `--replSet rs0`, `--tlsMode requireTLS` and `--keyFile`.
- `setup` service: its `depends_on` relies on this script exiting 0. `db:sync` and `access:bootstrap` run after it.

## Notes
- The script uses `set -euo pipefail`.
- The ping loop backs up `depends_on`'s `service_healthy`, because podman-compose 1.6 does not enforce healthchecks like Docker Compose does.
- The final PRIMARY wait is necessary because `rs.initiate()` returns before the election finishes. Without it, downstream services could see a set with no PRIMARY.
- `ping` works without auth even with `--keyFile`, which implies `--auth`.
- The CA cert at `/ca-dir` is shared out by `mongo-entrypoint.sh`, and `mongo-init.js` is the script that cannot call `rs.initiate()`; neither is a recorded graph neighbor.
