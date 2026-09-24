---
source: docker/observability/umami-init.sh
sha256: a51c4a44874c4dcb71b71f4568a554cf76d351c3a118aad6cf19cecd2def8d5e
generated_at: 2026-09-23T17:14:29.176010+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/umami-init.sh

## Purpose

One-shot Postgres init script that stamps the admin username/password (and a default website row) from environment variables onto Umami's factory-seeded admin account, so the stack is ready to log in immediately after first boot without manual steps.

## Key elements

- **`ADMIN_ID`** – Hardcoded UUID (`41e2b680-…`) of Umami's seeded admin row; assumed stable across v2.
- **Wait loop** – Polls `psql` every 2 s until a row exists in `"user"` for that `user_id`, ensuring the container is past its own seeding step before writing.
- **Credential UPDATE (first-run guard)** – `SET username/password` only where `password = crypt('umami', password)`, so it fires only while the factory default is still in place; a later `down`/`up` with the volume intact is a no-op.
- **Website INSERT** – Inserts a `website` row with a caller-supplied fixed `website_id` (`UMAMI_WEBSITE_ID`) and `ON CONFLICT (website_id) DO NOTHING`, making it idempotent and preserving any later UI edits.
- **`pgcrypto`** – Created via `CREATE EXTENSION IF NOT EXISTS` so `crypt()`/`gen_salt('bf')` are available; the resulting `$2a$` bcrypt hash is compatible with Umami's `bcryptjs` verifier.
- **Environment inputs** – `DATABASE_URL`, `UMAMI_ADMIN_USER`, `UMAMI_ADMIN_PASSWORD`, `UMAMI_WEBSITE_ID`, `UMAMI_WEBSITE_NAME`, `UMAMI_WEBSITE_DOMAIN` (all expected in the surrounding `.env`).

## Relationships

No graph neighbors are tracked for this file. It is invoked as a one-shot container entrypoint and communicates only with the Postgres instance identified by `DATABASE_URL`.

## Notes

- **First-run only**: Changing `UMAMI_ADMIN_PASSWORD` in `.env` after the initial stamp will **not** re-apply. Use the Umami UI, or reset `umami_db_volume`, to change the password later.
- **Fixed UUID assumption**: The script relies on Umami continuing to use the same `user_id` for its seeded admin. If Umami ever changes it, the `WHERE` clause silently matches nothing and the script exits "successfully" without applying credentials.
- **Idempotency split**: The credential UPDATE is guarded by the factory-password check; the website INSERT is guarded by `ON CONFLICT`. Both are safe to re-run, but the UPDATE will not overwrite a user-changed password.
- **`set -e` + `ON_ERROR_STOP=1`**: Any SQL error aborts the container immediately; there is no retry logic beyond the initial wait loop.
