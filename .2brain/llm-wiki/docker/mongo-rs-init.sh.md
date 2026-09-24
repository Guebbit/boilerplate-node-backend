---
source: docker/mongo-rs-init.sh
sha256: 1f5d2fcc419831dfece41d0053014867ccfda8fb05dc155d2c968ae707674a82
generated_at: 2026-09-23T17:12:43.233416+00:00
model: ollama:qwen3.8:27b
---

# docker/mongo-rs-init.sh

## Purpose

One-shot compose service that initiates a single-node MongoDB replica set (`rs0`) on the `database` service and blocks until the node reaches PRIMARY. It exists because MongoDB's own entrypoint init-scripts run in standalone mode (without `--replSet`), making `rs.initiate()` impossible from within the standard `docker-entrypoint-initdb.d` mechanism.

## Key elements

- **`TLS_OPTS` array** — connection flags (`--tls --tlsCAFile /ca-dir/mongo-ca.crt`) required because the `database` service runs with `--tlsMode requireTLS`. The CA cert is shared via the `/ca-dir` volume mounted read-only.
- **Ping loop** — `until mongosh … db.adminCommand('ping')` polls every second until `mongod` accepts TCP connections. Acts as a substitute for `depends_on: service_healthy` because podman-compose 1.6 does not honour that gate.
- **Idempotent `rs.initiate()`** — calls `rs.status()` first; if it throws ("no replset config has been received") the set is uninitiated and the script calls `rs.initiate({_id: "rs0", members: [{_id: 0, host: "database:27017"}]})`. Re-running is a no-op.
- **PRIMARY wait loop** — polls `rs.isMaster().ismaster` until it returns `true`, guaranteeing the node can accept writes before the script exits. This prevents downstream services (`setup`, `db:sync`, `access:bootstrap`) from racing a set that still has no elected PRIMARY.

## Relationships

No graph-neighbor files are tracked. The script interacts at runtime with the `database` compose service (MongoDB) and reads the CA cert shared by the entrypoint script (`mongo-entrypoint.sh`) via the `/ca-dir` volume.

## Notes

- Runs with `set -euo pipefail`; any unexpected failure aborts the compose stack.
- The PRIMARY-wait loop uses `grep -q true` on stdout rather than parsing JSON, so it is fragile if `mongosh` output format ever changes.
- Auth credentials come from `MONGO_ROOT_USER` / `MONGO_ROOT_PASSWORD` environment variables (set in compose); the ping loop is intentionally unauthenticated.
- The script is designed to be idempotent and safe to re-run, consistent with other seeder scripts in the repo.
