---
source: docker/observability/umami-init.sh
source_sha256: a51c4a44874c4dcb71b71f4568a554cf76d351c3a118aad6cf19cecd2def8d5e
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T01:34:17.727334+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/observability/umami-init.sh

## Purpose
A one-shot POSIX shell init script for Umami (analytics). Umami has no env var for admin credentials and always seeds a fixed `admin` / `umami` account on first boot. This script waits for that account to exist, then overwrites its username and password with values from the environment and seeds a default website, so the stack is ready to log in with no manual step.

## Key elements
- **`ADMIN_ID`**: the fixed UUID (`41e2b680-648e-4b09-bcd7-3e2b10c06264`) of Umami's seeded admin user.
- **Wait loop**: polls `psql "$DATABASE_URL"` every 2s until a row with `ADMIN_ID` exists in the `"user"` table.
- **Credential `UPDATE`**: sets `username` from `$UMAMI_ADMIN_USER` and `password` from `$UMAMI_ADMIN_PASSWORD`, hashed with pgcrypto `crypt(..., gen_salt('bf', 10))`. This produces a bcrypt hash that Umami's bcryptjs can verify.
- **Website `INSERT`**: creates a `"website"` row with the fixed id `$UMAMI_WEBSITE_ID`, plus `$UMAMI_WEBSITE_NAME` and `$UMAMI_WEBSITE_DOMAIN`. The row is owned by the admin user. `ON CONFLICT (website_id) DO NOTHING` makes it idempotent.
- **`CREATE EXTENSION IF NOT EXISTS pgcrypto`**: ensures the hashing functions are available.

## Relationships
No graph neighbors. It relies on these inputs at runtime:
- `DATABASE_URL`, `UMAMI_ADMIN_USER`, `UMAMI_ADMIN_PASSWORD`, `UMAMI_WEBSITE_ID`, `UMAMI_WEBSITE_NAME` and `UMAMI_WEBSITE_DOMAIN` from the environment. The header comment says the admin values come from `.env`.
- A Postgres database that Umami has already migrated and seeded.

## Notes
- **First-run only.** The `UPDATE` is guarded by `password = crypt('umami', password)`, which is true only while the factory default password is still set. Later `down`/`up` cycles with the Postgres volume intact never reset credentials.
- **Changing `UMAMI_ADMIN_PASSWORD` in `.env` later does not re-apply.** Change it in the Umami UI, or reset the `umami_db_volume` to start fresh.
- Values are passed to psql as variables (`-v`) and interpolated with `:'name'`, so they are quoted safely. `ON_ERROR_STOP=1` makes SQL failures abort the script, and `set -e` is also on.
- The wait loop has no timeout and hides psql errors (`2>/dev/null`), so it loops forever if the database is unreachable or Umami never seeds the account.
- The hardcoded admin UUID is described as stable across Umami v2 releases.
