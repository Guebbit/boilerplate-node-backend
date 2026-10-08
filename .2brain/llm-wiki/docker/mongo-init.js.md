---
source: docker/mongo-init.js
sha256: e98b9f7beb50d65bac2e5216a7d413cde39f726c61b15b400bb096848426367d
generated_at: 2026-10-07T23:47:56.173609+00:00
model: ollama:qwen3.8:27b
---

# docker/mongo-init.js

## Purpose

One-shot MongoDB initialization script (executed by the official MongoDB image via `docker-entrypoint-initdb.d`) that creates an application-scoped `readWrite` user on a **fresh, empty** data volume. It exists so the app authenticates as a least-privilege role rather than as the instance's root account, limiting the blast radius of a leaked connection string.

## Key elements

- **`appPassword` (const)** — Read from the file path in `process.env.MONGO_APP_PASSWORD_FILE` via mongosh's `require('fs').readFileSync`. Shared with the application by mounting the same secret file.
- **`db.getSiblingDB(process.env.MONGO_INITDB_DATABASE)`** — Switches the shell's current database to the app's database (the shell starts on `test`).
- **`db.createUser({ user, pwd, roles })`** — Creates the user named by `MONGO_APP_USER` with a single `readWrite` role scoped to `MONGO_INITDB_DATABASE`. No admin or cross-database privileges are granted.

## Relationships

No graph neighbors. This script is a leaf in the dependency graph: it is invoked by the MongoDB image's entrypoint, not by any application code.

## Notes

- **Runs only on an empty data directory.** Changing the password file later does **not** re-run this script against an existing volume. To re-initialize, delete the volume; to change the password on a live volume, do it manually in `mongosh`.
- The script relies on mongosh-specific globals (`require`, `db`) — it is not plain Node.js.
- The official image's built-in `_FILE` mechanism covers only `MONGO_INITDB_ROOT_*`; this script reads its own `_FILE` for the app password, hence the manual `readFileSync`.
- All three env vars (`MONGO_APP_USER`, `MONGO_APP_PASSWORD_FILE`, `MONGO_INITDB_DATABASE`) must be set in the container environment before the image starts, or the script will fail.
