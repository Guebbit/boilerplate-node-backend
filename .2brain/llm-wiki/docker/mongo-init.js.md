---
source: docker/mongo-init.js
sha256: 30e216f7b46704cadee88501433df3d00b09675d1054ea6d8e73fb1675e37ebe
generated_at: 2026-10-14T06:49:45.433629+00:00
model: ollama:qwen3.8:27b
---

# docker/mongo-init.js

## Purpose

One-time MongoDB bootstrap script that runs only against an empty data directory (via `docker-entrypoint-initdb.d`). It creates least-privilege application and backup users so the app never authenticates as the instance root, limiting blast radius if a connection string leaks.

## Key elements

- **`readWrite` user creation** – Reads the password from the file pointed to by `MONGO_APP_PASSWORD_FILE`, then calls `createUser` on the sibling DB named by `MONGO_INITDB_DATABASE` with a single `readWrite` role scoped to that database.
- **Optional `backup` user creation** – If `MONGO_BACKUP_PASSWORD_FILE` is set, reads that file and creates a user in the `admin` database with the built-in `backup` role (read-only, spans all databases, needed for `mongodump --oplog`).
- **`require('fs')`** – mongosh's own module loader (not Node.js); used to read secret files whose paths come from env vars.
- **`db.getSiblingDB(...)`** – Switches context to the target database, since the script initially connects to `test`.

## Relationships

- **`docker/Dockerfile.backup`** (referenced in comments) – Consumer of the `backup` user; the same `MONGO_BACKUP_PASSWORD_FILE` is mounted into that service.

## Notes

- **First-run only.** The script executes solely when the data volume is empty. Rotating the password file later does *not* re-run it; you must drop the volume or change the password via `mongosh` manually.
- **File-based secrets, not env vars.** The official image's `_FILE` convenience covers only `MONGO_INITDB_ROOT_*`; this script reads its own files because the app and the data service share one password file.
- **Backup user is conditional.** Stacks that omit the backup profile simply unset `MONGO_BACKUP_PASSWORD_FILE` and the block is skipped.
- **`require` is mongosh-specific.** This file is not valid Node.js; it is executed by the `mongosh` runtime inside the `mongo` container.
