---
source: scenarios/accounts.ts
sha256: 6fae93f0345351a4d68647348144fc70db03fbb85ca339c4cafdc8c323a727b1
generated_at: 2026-10-29T01:20:58.497541+00:00
model: ollama:qwen3.8:27b
---

# scenarios/accounts.ts

## Purpose

Central registry of the demo persona accounts: their fixed MongoDB ObjectId constants, their login credentials (email + plaintext password + optional TOTP/backup-code extras), and the `seedAccessModel` function that places them into the access-control system. Other scenario files import the IDs here so they can seed related rows (addresses, orders, etc.) that belong to a known person, without re-deriving the id.

## Key elements

- **`SEED_ADMIN_ID`, `SEED_USER_ID`, `SEED_EDITOR_ID`, `SEED_MODERATOR_ID`** — Fixed ObjectIds for the four original staff/demo roles.
- **`SEED_UNVERIFIED_ID` … `SEED_SECOND_SHOPPER_ID`** — Fixed ObjectIds for the five customer-state personas (unverified, 2FA, pending-email, banned, second shopper).
- **`SEED_MANAGER_ID` … `SEED_OPERATOR_ID`** — Fixed ObjectIds for the four shop/platform staff roles (manager, warehouse, support, operator).
- **`SEED_STAFF_TOTP_SECRET`** — Base32 authenticator secret shared by all armed accounts; read from env via `seedPasswordsConfig()`.
- **`SEED_PENDING_EMAIL_TARGET`** — The unconfirmed destination email for the pending-email persona.
- **`SEED_TWO_FACTOR_BACKUP_CODES`** — Five fixed single-use backup codes for the 2FA persona.
- **`SEED_IDS`** — `Readonly<Record<PersonaName, string>>` mapping every persona name to its id; the canonical lookup for other seed files.
- **`SeedLogin`** (interface) — Shape of a published login: `email`, `password`, optional `totpSecret`, optional `backupCodes`.
- **`seedCredentials`** — Precomputed `Record<PersonaName, SeedLogin>` built once at module load by combining `personas.yaml` email/state with passwords from `seedPasswords()`.
- **`SEED_ADMIN_PASSWORD`, `SEED_USER_PASSWORD`** — Convenience re-exports of the two most-used plaintext passwords.
- **`seedAccessModel()`** — Bootstraps the access service ("The Demo Shop" tenant), then seeds every persona's role memberships (from `personas.yaml`) via `seedMembership`. Returns `Promise<void>`.

## Relationships

- **`scenarios/personas-schema.ts`** — Source of truth for persona emails, states, and role memberships. This file imports `personas`, `PERSONA_NAMES`, and the `PersonaName` type from it.
- **`scenarios/config.ts`** — Supplies `seedPasswords()` (env-overridable passwords) and `seedPasswordsConfig()` (the TOTP secret). Called at module-load time.
- **`src/modules/access/index.ts`** — Provides `accessService`, used by `seedAccessModel` to create the tenant and seed memberships.
- **`src/modules/access/services/index.ts`** — Underlying service implementation behind `accessService`; `seedAccessModel` calls `bootstrapAccess` and `seedMembership` (from `@modules/access/tests/factories`) against it.
- **`scenarios/shop.scenario.ts` / `scenarios/blank.ts`** — Both call `seedAccessModel()` to establish the shared access model before seeding their scenario-specific rows.
- **`scenarios/users.ts`** — Builds the actual user-document rows for the persona ids defined here.
- **`scenarios/addresses.ts`** — Consumes `SEED_PENDING_EMAIL_TARGET` (and likely other persona ids) when seeding address rows tied to a specific account.

## Notes

- All ids are **hardcoded ObjectIds** with intentional vintage (leading bytes date them to Feb 2024 / March 2024). Do not regenerate them; the paired frontend e2e suite reads logins from `seedCredentials` published in the scenario description, so the id↔login pairing is a contract.
- Passwords and the TOTP secret are **plaintext in this file by design** — the Mongoose schema's pre-save hook performs hashing/encryption. The paired e2e keeps no separate copy.
- `seedCredentials` is computed **once at import time** (IIFE), not lazily. Any env changes after import will not affect it.
- `seedAccessModel` is idempotent in practice only if `bootstrapAccess` is idempotent; it is called by both `shop.scenario.ts` and `blank.ts`, so running both in sequence will call it twice.
- The `loginOf` helper conditionally spreads `totpSecret` / `backupCodes` based on `personas.accounts[name].state` flags, so the shape of each `SeedLogin` varies by persona.
