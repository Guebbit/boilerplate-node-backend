---
source: docker/observability/umami-init.sh
sha256: a51c4a44874c4dcb71b71f4568a554cf76d351c3a118aad6cf19cecd2def8d5e
generated_at: 2026-11-08T02:24:24.681463+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/umami-init.sh

## Purpose

One-shot init script that stamps the admin username/password (from `.env`) onto Umami's factory-seeded admin account and inserts a default website row with a known ID. It exists because Umami ships with hardcoded credentials (`admin` / `umami`) and offers no environment-variable override, so the stack needs this bridge step to be log-in-ready without manual DB work.

## Key elements

- **`ADMIN_ID`** — Hardcoded UUID (`41e2b680-…`) that Umami v2 uses for its seeded admin row; stable across v2 releases.
- **Wait loop** (`until psql … | grep -q 1; sleep 2; done`) — Polls Postgres until the seeded admin row exists before proceeding.
- **Credential UPDATE** — Sets `username` and `password` (bcrypt-hashed via `pgcrypto.crypt`) on the admin row. Guarded by `WHERE password = crypt('umami', password)` so it fires **only** while the factory default is still in place.
- **Website INSERT** — Creates a `website` row with the fixed `UMAMI_WEBSITE_ID`, name, and domain from env. Uses `ON CONFLICT (website_id) DO NOTHING` for idempotency and to preserve later UI edits.
- **psql variable passing** (`-v uname=… -v pw=…` etc.) — Values are quoted safely by psql rather than interpolated into the SQL string.

## Relationships

No graph-neighbor files are recorded. The script is invoked as a one-shot container entrypoint (or `docker compose run`-style command) against the shared Postgres database referenced by `DATABASE_URL`.

## Notes

- **First-run only by design.** Once the admin password is no longer the literal string `"umami"`, the UPDATE's `WHERE` guard is false and the script becomes a no-op for credentials. A `down`/`up` cycle with the `umami_db_volume` intact therefore never resets a changed password.
- **Changing `UMAMI_ADMIN_PASSWORD` in `.env` later has no effect.** Update the password in the Umami UI, or delete the Postgres volume and re-run from scratch.
- The website INSERT *is* idempotent across runs (idempotent by `ON CONFLICT`), so re-running the script after a volume reset will recreate the same website row but will not clobber UI edits made under the same ID.
- Script uses POSIX `sh` (not `bash`); `set -e` is the only shell option.
- Requires the `pgcrypto` extension to be creatable in the target database (`CREATE EXTENSION IF NOT EXISTS`).
