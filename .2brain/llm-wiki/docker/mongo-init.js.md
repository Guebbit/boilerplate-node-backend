---
source: docker/mongo-init.js
sha256: 30e216f7b46704cadee88501433df3d00b09675d1054ea6d8e73fb1675e37ebe
generated_at: 2026-11-08T02:20:44.231504+00:00
model: ollama:qwen3.8:27b
---

# docker/mongo-init.js

## Purpose

A MongoDB first-boot initialization script (executed via `docker-entrypoint-initdb.d`) that creates application-scoped users with minimal privileges, so the app and backup containers never authenticate as the instance root. It runs exactly once against an empty data directory.

## Key elements

- **App user creation** — Reads `MONGO_APP_PASSWORD_FILE`, then calls `db.createUser` with the `readWrite` role scoped to `MONGO_INITDB_DATABASE` (set via `MONGO_INITDB_ROOT_DATABASE` by the image). User name comes from `MONGO_APP_USER`.
- **Backup user creation (conditional)** — If `MONGO_BACKUP_PASSWORD_FILE` is set, creates a user in the `admin` database with the built-in `backup` role (read-only, oplog-capable, no write/delete). Password read from the file the backup container mounts.
- **Password loading** — Uses `require('fs').readFileSync` (mongosh's own `require`) to read each password from its `_FILE` path, since the official image's `_FILE` support covers only `MONGO_INITDB_ROOT_*`.

## Relationships

- **docker-compose.production.yml** — Declares the environment variables this script consumes (`MONGO_INITDB_DATABASE`, `MONGO_APP_USER`, `MONGO_APP_PASSWORD_FILE`, and optionally `MONGO_BACKUP_USER` / `MONGO_BACKUP_PASSWORD_FILE`) and mounts the corresponding secret files into the `mongo` container. The script is the consumer; the compose file is the producer of its configuration.

## Notes

- **First-run only.** Changing a password file later does *not* re-run this script on an existing volume. Reset requires dropping the volume or manually updating the password via `mongosh`.
- **Not idempotent by design.** It relies on the empty-directory guarantee of `docker-entrypoint-initdb.d`; re-running against a populated database would fail on `createUser` duplicates.
- **No fallback for missing `MONGO_APP_PASSWORD_FILE`.** If the file or env var is absent the script throws; there is no default or warning path.
- **`db` reassignment.** The script switches `db` to `getSiblingDB(MONGO_INITDB_DATABASE)` mid-file; all subsequent `db` references target that database, not whatever was default.
