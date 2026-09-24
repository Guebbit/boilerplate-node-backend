---
source: docker/mongo-init.js
sha256: 3c0966cd48d59d8ecc8a9b323b7718d55a827e5e59f1ced3512c83b8d69b49db
generated_at: 2026-09-23T17:12:35.425659+00:00
model: ollama:qwen3.8:27b
---

# docker/mongo-init.js

## Purpose

A one-shot MongoDB bootstrap script executed automatically by the official `mongo` image on first container start (via `docker-entrypoint-initdb.d`). It creates a least-privilege `readWrite` user scoped to the application database, so the app authenticates as itself rather than as the instance root account.

## Key elements

- **`db.getSiblingDB(process.env.MONGO_INITDB_DATABASE)`** — Switches the shell context from `admin` (the default `mongosh` DB during init) to the app database named by the `MONGO_INITDB_DATABASE` env var.
- **`db.createUser(...)`** — Creates a user (`MONGO_APP_USER` / `MONGO_APP_PASSWORD`) with a single `readWrite` role limited to that same database. No `root`, no cross-DB privileges.

## Relationships

No graph neighbors. This file is a standalone, one-time-executed script with no imports or exports; it is invoked implicitly by the MongoDB container entrypoint.

## Notes

- **First-run only.** The script runs exclusively against an empty data directory. Changing `MONGO_APP_PASSWORD` later has no effect on an existing volume; you must either delete the volume or update the password manually via `mongosh`.
- **Env vars required at first boot:** `MONGO_INITDB_DATABASE`, `MONGO_APP_USER`, `MONGO_APP_PASSWORD`. (The image also expects `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD` for the initial root account, but those are not referenced in this file.)
- The script relies on the convention that `mongosh` is already authenticated as the root user when `docker-entrypoint-initdb.d` scripts run.
