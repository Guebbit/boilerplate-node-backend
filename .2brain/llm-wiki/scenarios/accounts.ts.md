---
source: scenarios/accounts.ts
sha256: b87d381e6d8981686ac6719d179e2ba04042dbc83340b791d19962ffeed6a121
generated_at: 2026-10-14T06:54:58.817194+00:00
model: ollama:qwen3.8:27b
---

# scenarios/accounts.ts

## Purpose

Central registry of every seed account used across the demo scenario suite: fixed ObjectIds, login credentials, two-factor backup codes, and the role assignments that place each account into the tenant/platform access model. Every other scenario file imports one of these IDs or credential bundles from here so that all e2e journeys agree on *who* they are logging in as.

## Key elements

- **ID constants** (`SEED_ADMIN_ID`, `SEED_USER_ID`, `SEED_EDITOR_ID`, `SEED_MODERATOR_ID`, `SEED_UNVERIFIED_ID`, `SEED_TWO_FACTOR_ID`, `SEED_PENDING_EMAIL_ID`, `SEED_BANNED_ID`, `SEED_SECOND_SHOPPER_ID`, `SEED_MANAGER_ID`, `SEED_WAREHOUSE_ID`, `SEED_SUPPORT_ID`, `SEED_OPERATOR_ID`) — 24-char hex ObjectIds, grouped into four demo accounts, five persona accounts, and four staff accounts.
- **Credential constants** — one `SEED_*_EMAIL` / `SEED_*_PASSWORD` pair per account. Passwords are plaintext and read from `seedPasswordsConfig()` (env-overridable); the schema's pre-save hook hashes them at write time.
- `SEED_TWO_FACTOR_BACKUP_CODES` — five fixed 10-hex-char backup codes; the stored row holds only digests.
- `SEED_PENDING_EMAIL_TARGET` — the unconfirmed new email address for the pending-email persona.
- `seedPersonaCredentials` — `{ unverified, twoFactor, pendingEmail, banned, secondShopper }` bundle of `{ email, password }` (plus `backupCodes` for twoFactor).
- `seedStaffCredentials` — `{ manager, warehouse, support, operator }` bundle of `{ email, password }`.
- `seedCredentials` — the full flat bundle: the four demo accounts spread with both persona and staff bundles.
- `seedAccessModel()` — calls `bootstrapAccessModel('The Demo Shop')`, then assigns each account its tenant and/or platform role via `assignRole`. The admin account gets **two** memberships (tenant `admin` + platform `operator`); the operator account gets **only** the platform `operator` role (no tenant).

## Relationships

- **`scenarios/config.ts`** — provides `seedPasswordsConfig()`, the single source for all `NODE_SEED_*_PASSWORD` env overrides read at module load.
- **`src/modules/access/index.ts`** — exports `assignRole` and `bootstrapAccessModel`, the two functions `seedAccessModel()` uses to create the tenant and attach roles.
- **`scenarios/apply.ts`** and **`scenarios/blank.ts`** — both call `seedAccessModel()` so their resulting databases agree on account identity and role placement.
- **`scenarios/users.ts`** — builds the Mongoose document rows whose `_id` values are the constants defined here.
- **`scenarios/index.ts`** — top-level orchestrator; transitively depends on this file's exports for every sub-scenario it wires up.
- **`scenarios/addresses.ts`** — the pending-email persona's target address (`SEED_PENDING_EMAIL_TARGET`) is referenced here when seeding address-change documents.
- **`scenarios/example.ts`, `scenarios/flows/shop-history.ts`, `scenarios/subjects.ts`, `scenarios/support/demo.ts`, `scenarios/wishlist.ts`** — import one or more ID/credential constants to log in as a specific account during their journey steps.
- **`tests/integration/access.test.ts`** — exercises the role assignments produced by `seedAccessModel()` against a live database.
- **`tests/integration/scenarios/apply.test.ts`** — runs the full apply flow, which includes the `seedAccessModel()` call, and asserts the resulting account state.

## Notes

- **Passwords are intentionally plaintext in source.** The Mongoose pre-save hook hashes them before the row is written. Do not "fix" this by pre-hashing.
- **`NODE_SEED_*_PASSWORD` values must stay in sync with the paired frontend's `.env`.** The frontend's e2e login types the same string; a mismatch breaks e2e without any test failure on the backend side.
- **IDs are real ObjectIds with a fixed datestamp** (Feb 2024 for admin/user; sequential hex for the rest). They are *not* generated at seed time — regenerating them would orphan any fixture that references them by string.
- **`SEED_ADMIN_ID` holds two roles** (tenant admin + platform operator) while `SEED_OPERATOR_ID` holds only the platform role. This is deliberate: it demonstrates the platform/tenant split in a single login.
- **Backup codes are single-use** in the real system; the seed stores digests, but the journey needs to know a valid code, hence the fixed plaintext array. The two-factor reset flow in `users.ts` restores them.
- `seedAccessModel()` is a pure `Promise<void>` — it has no return value, so callers cannot inspect the tenant it created. The tenant's `_id` is only available inside the `.then()` chain.
