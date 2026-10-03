---
source: scenarios/accounts.ts
sha256: e5a19d1069a215871a2cbd7d38a7adf17d089d75c4962b7efe6b4c725ba92bcf
generated_at: 2026-10-01T12:19:53.284418+00:00
model: ollama:qwen3.8:27b
---

# scenarios/accounts.ts

## Purpose

Single source of truth for every seed account in the demo/test environment: their fixed ObjectIds, login credentials (email + plaintext password), and the role assignments that place them into the access model. All other scenario files import IDs from here rather than hardcoding them, so changing an account's identity or credentials is a one-file edit.

## Key elements

- **`SEED_*_ID` constants** – Fixed 24-char hex ObjectIds for 12 accounts: 4 demo (admin, user, editor, moderator), 4 persona (unverified, two-factor, pending-email, banned), and 4 staff (manager, warehouse, support, operator).
- **`SEED_*_EMAIL` / `SEED_*_PASSWORD` constants** – Login email (hardcoded) and password (read via `seedPasswordsConfig()` from `scenarios/config.ts`). Passwords are plaintext; the schema's pre-save hook hashes them.
- **`SEED_TWO_FACTOR_BACKUP_CODES`** – Five 10-char hex backup codes, published in the clear so an e2e journey can consume one. Stored in the DB only as digests.
- **`SEED_PENDING_EMAIL_TARGET`** – The new-address email the pending-email persona has requested but not yet confirmed (used by `scenarios/addresses.ts`).
- **`seedPersonaCredentials` / `seedStaffCredentials` / `seedCredentials`** – Grouped `{ email, password }` (plus `backupCodes` for two-factor) objects keyed by human-readable name, for convenient lookup in specs.
- **`seedAccessModel()`** – Bootstraps the "The Demo Shop" tenant via `bootstrapAccessModel`, then assigns each account its role(s) via `assignRole`. Called by both `seedShop` and `seedBlank`.

## Relationships

- **`scenarios/config.ts`** – Provides `seedPasswordsConfig()`, which reads `NODE_SEED_*_PASSWORD` env vars to supply every password constant in this file.
- **`src/modules/access/index.ts`** – Exports `assignRole` and `bootstrapAccessModel`, the two functions `seedAccessModel` calls to build the tenant and wire up role memberships.
- **`scenarios/users.ts`** – Consumes the IDs exported here to build the actual user document rows that get inserted into the database.
- **`scenarios/blank.ts`** – Calls `seedAccessModel()` as part of its blank-scenario seeding (alongside `seedShop` in `scenarios/apply.ts`).
- **`scenarios/apply.ts`** – The apply scenario that invokes `seedAccessModel`; it guards against running outside development/test.
- **`scenarios/addresses.ts`** – Uses `SEED_PENDING_EMAIL_TARGET` to model the unconfirmed address-change journey.
- **`tests/integration/access.test.ts`** – Exercises the role assignments produced by `seedAccessModel`.
- **`tests/integration/scenarios/apply.test.ts`** – Integration-tests the full apply flow, which depends on the credentials and roles defined here.

## Notes

- **Passwords are intentionally plaintext in this file.** The schema's pre-save hook hashes them on write. Do not "fix" this to store a hash.
- **IDs are fixed ObjectIds, not generated.** The demo admin and user IDs encode a February 2024 timestamp in their leading bytes; the persona/staff IDs are sequential. Regenerating them will break any external reference (frontend e2e, paired `.env` files).
- **Env-var override contract:** each `NODE_SEED_*_PASSWORD` must match the identically-named variable in the paired frontend's `.env`. Changing the name here without updating the frontend breaks login.
- **`seedAccessModel` gives `SEED_ADMIN_ID` two memberships** (tenant `admin` + platform `operator`) while `SEED_OPERATOR_ID` gets only the platform role (no shop). This asymmetry is deliberate: the admin account demonstrates the dual-hat behaviour, the operator demonstrates a pure-platform actor.
- **`seedCredentials` is a flat merge** of the four demo accounts, all four persona accounts, and all four staff accounts — 12 entries total. Use the grouped objects (`seedPersonaCredentials`, `seedStaffCredentials`) when you need only a subset.
