---
source: docker/mongo-rs-init.sh
sha256: c3378d2ee5b607e5725733d0af8dceea107e40442dad7dfd343c7a0e57e31f27
generated_at: 2026-11-08T02:20:54.899671+00:00
model: ollama:qwen3.8:27b
---

# docker/mongo-rs-init.sh

## Purpose

One-shot Compose service that initiates the single-node replica set (`rs0`) on the `database` MongoDB container and blocks until that node reaches **PRIMARY** before exiting. It exists because the MongoDB entrypoint's temporary init scripts run *without* `--replSet`, making `rs.initiate()` impossible from `mongo-init.js`; this container connects to the already-running, replSet-enabled `mongod` over the Compose network instead.

## Key elements

- **`TLS_OPTS`** – Array passed to every `mongosh` invocation; enables TLS and points at the shared CA cert (`/ca-dir/mongo-ca.crt`) mounted read-only from the `database` service.
- **`AUTHENTICATE`** – Multi-line JS fragment prepended to authenticated `--eval` calls. Reads the root password from `/run/secrets/mongo_root_password` via Node's `fs.readFileSync` (avoids exposing the secret in `ps`/`cmdline`) and calls `db.getSiblingDB("admin").auth(...)`.
- **Readiness poll** – `until mongosh … db.adminCommand('ping').ok` loop (1 s sleep). Acts as a hard gate for `podman-compose 1.6`, which does not honour `service_healthy` the way Docker Compose does.
- **Idempotent initiation** – Tries `rs.status()`; on the "no replset config" error calls `rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'database:27017' }] })`. Re-running is a no-op.
- **PRIMARY wait loop** – Polls `rs.isMaster().ismaster` until it returns `true`, ensuring the node can accept writes before downstream services (`db:sync`, `access:bootstrap`) proceed.

## Relationships

No graph-neighbour files are registered. The script interacts at runtime with:

- **`database`** (Compose service / `mongod`) – the sole target; connects via `database:27017` over the Compose network.
- **`/ca-dir/mongo-ca.crt`** – CA certificate shared out by the `database` entrypoint (`mongo-entrypoint.sh`).
- **`/run/secrets/mongo_root_password`** – Secret file mounted by Compose; read only inside the JS context.

## Notes

- **`podman-compose 1.6` healthcheck gap:** the ping loop is not redundant belt-and-suspenders; on podman-compose it is the *only* mechanism that blocks until `mongod` is reachable, since `depends_on: condition: service_healthy` is not enforced the same way as in Docker Compose.
- **`rs.initiate()` ≠ PRIMARY:** the initiation call returns before the single-node election completes. The final `ismaster` poll is what actually guarantees write-readiness for downstream services.
- **Secret handling:** the root password is deliberately never passed as a CLI `-p` argument to avoid leaking via `ps` / `/proc/<pid>/cmdline`; it is read from a file inside the JS `require("fs")` context.
- **Idempotency contract:** re-running the script against an already-initiated set is safe and prints a log line rather than erroring, consistent with the repo's other one-shot seeder services.
