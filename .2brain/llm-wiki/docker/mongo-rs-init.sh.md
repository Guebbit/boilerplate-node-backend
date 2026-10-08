---
source: docker/mongo-rs-init.sh
sha256: c3378d2ee5b607e5725733d0af8dceea107e40442dad7dfd343c7a0e57e31f27
generated_at: 2026-10-07T23:48:07.439461+00:00
model: ollama:qwen3.8:27b
---

# docker/mongo-rs-init.sh

## Purpose
One-shot Compose service that initiates the `rs0` replica set on the `database` container and blocks until that node becomes PRIMARY. It exists because MongoDB's own entrypoint init-scripts run against a temporary standalone mongod (no `--replSet` flag), so `rs.initiate()` is impossible there; this script targets the real, replSet-enabled instance after it has already started.

## Key elements
- **`TLS_OPTS`** – Array of `mongosh` flags (`--tls`, `--tlsCAFile /ca-dir/mongo-ca.crt`) appended to every connection. The CA cert is shared read-only from the `database` service's `/ca-dir`.
- **`AUTHENTICATE`** – A JS snippet prepended to authenticated `--eval` calls. Reads the root password from `/run/secrets/mongo_root_password` via `require("fs")` (deliberately *not* a CLI `-p` flag) and calls `db.getSiblingDB("admin").auth(...)`.
- **Readiness loop (first `until`)** – Polls `db.adminCommand('ping')` unauthenticated every 1 s until mongod answers. Compensates for podman-compose 1.6 not honouring `service_healthy` the way Docker Compose does.
- **Initiate (second `mongosh` call)** – Tries `rs.status()`; on the "no replset config" error it calls `rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'database:27017' }] })`. Idempotent: a second run is a no-op.
- **PRIMARY loop (second `until`)** – Polls `rs.isMaster().ismaster` until it returns `true`, ensuring the node has won election before the script exits 0.
- **`echo "[mongo-rs-init] database is PRIMARY"`** – Final confirmation; exit code 0 is the signal `setup`'s `depends_on` gate waits for.

## Relationships
No graph neighbours are recorded. The script is invoked as a standalone Compose service; its only runtime dependency is the `database` service (connects to `database:27017` over the Compose network). Downstream services (`setup`, `db:sync`, `access:bootstrap`) depend on this script's successful exit via `depends_on`.

## Notes
- The password is intentionally read from a mounted secret file inside the JS eval, never passed as a `mongosh -p` argument, to keep it out of `ps` / `/proc/<pid>/cmdline`.
- The first ping loop is *unauthenticated* by design (`ping` is exempt from auth even under `--keyFile`); the subsequent calls include `$AUTHENTICATE`.
- `rs.initiate()` resolves before the local node finishes election; the explicit PRIMARY poll is what actually guarantees write-readiness for downstream seeders.
- The script is run **once** as a one-shot service (not an `init` script inside the mongod container). Re-running it is safe (idempotent).
- Requires `/ca-dir/mongo-ca.crt` to be mounted read-only on this service and `/run/secrets/mongo_root_password` to be present.
