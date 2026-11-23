---
source: docker/mongo-init.js
source_sha256: 30e216f7b46704cadee88501433df3d00b09675d1054ea6d8e73fb1675e37ebe
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T01:30:40.526254+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/mongo-init.js

## Purpose
MongoDB first-run initialization script, placed under `docker-entrypoint-initdb.d`. It creates least-privilege database users so the application and the backup container never authenticate as the instance's root account. It runs through `mongosh`, already authenticated as `MONGO_INITDB_ROOT_*`.

## Key elements
- **App user creation**: reads the password from the file at `MONGO_APP_PASSWORD_FILE`, switches to the database named by `MONGO_INITDB_DATABASE`, and creates `MONGO_APP_USER` with the `readWrite` role on that database only.
- **Backup user creation** (conditional): if `MONGO_BACKUP_PASSWORD_FILE` is set, it reads that password and creates `MONGO_BACKUP_USER` in the `admin` database with the built-in `backup` role. The role is enough for a full `mongodump --oplog` but cannot write or delete.

## Relationships
- No graph neighbors and no code-level dependencies. It is configured entirely through environment variables and password files.
- The password files are the same secret files that the app and the `backup` service mount, so each password lives in a single file shared by the data service and its client.

## Notes
- **First run only.** Mongo executes init scripts only against an empty data directory. Changing a password file later does not update an existing volume. Drop the volume or update the user from `mongosh`.
- The official image's `_FILE` support covers only `MONGO_INITDB_ROOT_*`, so this script reads its own password files with `require('fs')`, which is mongosh's own `require`.
- The backup user is skipped when `MONGO_BACKUP_PASSWORD_FILE` is unset, so stacks without the backup profile still start.
- The app password is read unconditionally. A missing `MONGO_APP_PASSWORD_FILE` makes the script throw.
