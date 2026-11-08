---
source: scenarios/accounts.ts
sha256: 6fae93f0345351a4d68647348144fc70db03fbb85ca339c4cafdc8c323a727b1
generated_at: 2026-11-08T02:27:08.758005+00:00
model: ollama:qwen3.8:27b
---

# scenarios/accounts.ts

## Purpose

Central registry of the 13 demo/seed accounts: their fixed ObjectIds, plaintext login credentials (email, password, TOTP secret, backup codes), and the single function that seeds the full access model (tenant + role memberships) from `personas.yaml`. Other scenario files import the id constants here instead of hard-coding them, keeping a single source of truth for "who these people are."

## Key elements

- **Id constants** (`SEED_ADMIN_ID`, `SEED_USER_ID`, `SEED_EDITOR_ID`, `SEED_MODERATOR_ID`, `SEED_UNVERIFIED_ID`, `SEED_TWO_FACTOR_ID`, `SEED_PENDING_EMAIL_ID`, `SEED_BANNED_ID`, `SEED_SECOND_SHOPPER_ID`, `SEED_MANAGER_ID`, `SEED_WAREHOUSE_ID`, `SEED_SUPPORT_ID`, `SEED_OPERATOR_ID`) — fixed 24-char hex ObjectIds, one per persona.
- **`SEED_STAFF_TOTP_SECRET`** — plaintext base32 secret of the authenticator app; read from `seedPasswordsConfig()`.
- **`SEED_PENDING_EMAIL_TARGET`** — the unconfirmed email address the pending-email persona is migrating to (sourced from `personas.yaml`).
- **`SEED_TWO_FACTOR_BACKUP_CODES`** — five single-use 10-hex-char backup codes for the 2FA persona.
- **`SEED_IDS`** — `Readonly<Record<PersonaName, string>>` mapping every persona name to its id.
- **`SeedLogin`** (interface) — shape of one account's published credentials: `email`, `password`, optional `totpSecret`, optional `backupCodes`.
- **`seedCredentials`** — precomputed `Record<PersonaName, SeedLogin>` covering all 13 accounts; built once at module load.
- **`SEED_ADMIN_PASSWORD` / `SEED_USER_PASSWORD`** — convenience plaintext password exports.
- **`seedAccessModel()`** — async; calls `accessService.bootstrapAccess('The Demo Shop')`, then fans out `seedMembership` calls for every role listed in `personas.yaml`.
- **`loginOf`** (private) — resolves one persona's email, password (from env or default), and any state-dependent extras (TOTP, backup codes).

## Relationships

- **`scenarios/config.ts`** — provides `seedPasswords()` and `seedPasswordsConfig()` which supply the plaintext passwords and the TOTP secret.
- **`scenarios/personas-schema.ts`** — provides the typed `personas` data (emails, states, memberships), the `PERSONA_NAMES` list, and the `PersonaName` type that keys all exports here.
- **`scenarios/blank.ts`** — calls `seedAccessModel()` to establish the access model in the "blank" scenario.
- **`scenarios/shop.scenario.ts`** — calls `seedAccessModel()` to establish the access model in the full shop scenario.
- **`scenarios/users.ts`** — builds the actual user-document rows using the id constants exported here.
- **`scenarios/support/demo.ts`** — frontend e2e helper that reads `seedCredentials` from the scenario description (no local copy of passwords).
- **`src/modules/access/index.ts`** — exports `accessService`, which `seedAccessModel()` calls to bootstrap the tenant.

## Notes

- All passwords and the TOTP secret are **plaintext** in this file by design; the schema's pre-save hook hashes them before persistence. Do not "fix" this to hashed values.
- Ids are **hard-coded ObjectIds**, not generated at runtime. The leading bytes date them to Feb 2024. Treat them as immutable fixtures.
- `seedAccessModel` is the single place that creates role memberships. It is idempotent by design (called by both `blank` and `shop` scenarios) — the two scenarios must agree on who these accounts are.
- The `Object.fromEntries` → `as Record<PersonaName, SeedLogin>` cast in `seedCredentials` is a type-narrowing workaround; `PERSONA_NAMES` guarantees every key appears exactly once.
- The paired frontend e2e suite reads each login from the scenario's published description (`seedCredentials`); it intentionally holds **no** separate credential store.
