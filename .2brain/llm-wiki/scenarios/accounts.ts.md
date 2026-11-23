---
source: scenarios/accounts.ts
source_sha256: 30ccd26810a31b82429a1ac9e9035aedba8a09c2fec13547fe85993e28058221
context_sha256: 288e90dde1a856dfd2acfd8a7a47a427d49b5e7e34f20efb6c2775868062bae1
generated_at: 2026-11-22T01:41:18.987325+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/accounts.ts

## Purpose
Defines who the seed accounts are for the demo/e2e scenarios: their fixed ids, their published logins, and how they are placed into the access model. Logins, states and roles come from `shared/scenarios/personas.yaml` (via `personas-schema`); only the ids live here, because other scenario files seed rows belonging to these people and import the ids from this file.

## Key elements
- **`SEED_*_ID` constants** – fixed 24-char hex ObjectId strings for the 13 accounts: admin, user, editor, moderator; the five personas (unverified, two-factor, pending-email, banned, second shopper); and four staff (manager, warehouse, support, operator).
- **`SEED_IDS`** – `Record<PersonaName, string>` mapping each persona name to its id.
- **`SeedLogin`** – interface: `email`, plaintext `password`, optional `totpSecret` (authenticator armed), optional `backupCodes` (email-2FA persona).
- **`seedCredentials`** – `Record<PersonaName, SeedLogin>` built at module load from `PERSONA_NAMES`, `personas.accounts`, and `seedPasswords()`. `totpSecret` is added when the persona's state has `authenticator`; `backupCodes` when it has `twoFactor`.
- **`SEED_ADMIN_PASSWORD` / `SEED_USER_PASSWORD`** – shortcuts into `seedCredentials`.
- **`SEED_STAFF_TOTP_SECRET`** – base32 authenticator secret, read from `seedPasswordsConfig().NODE_SEED_STAFF_TOTP_SECRET`.
- **`SEED_PENDING_EMAIL_TARGET`** – the unconfirmed new address, taken from the pending-email persona's state in `personas.yaml`.
- **`SEED_TWO_FACTOR_BACKUP_CODES`** – five fixed plaintext single-use codes (10 hex chars each).
- **`seedAccessModel()`** – bootstraps the access model for a shop named "The Demo Shop", then creates every membership listed per persona in `personas.yaml` via `seedMembership`. Tenant-scoped memberships get the tenant's id; others get `null`.

## Relationships
- **`./config`** – supplies `seedPasswords` (per-persona passwords) and `seedPasswordsConfig` (TOTP secret).
- **`./personas-schema`** – supplies the parsed `personas` data, `PERSONA_NAMES`, and the `PersonaName` type.
- **`src/modules/access/index.ts`** – exports `accessService`, which `seedAccessModel` uses to create the shop and presets.
- **`src/modules/access/tests/factories.ts`** – `seedMembership` inserts each membership row.
- Per the file's own comments, `scenarios/users.ts` builds the user rows from these ids, and both `seedShop` and `seedBlank` call `seedAccessModel` so the scenarios agree on the accounts. Other scenario files that seed rows owned by these people import the ids from here.

## Notes
- Passwords, the TOTP secret and backup codes are intentionally PLAINTEXT. The schema's pre-save hook hashes passwords; the row stores the TOTP secret encrypted and only digests of the backup codes.
- The paired frontend's e2e reads each login from the scenario description (`seedCredentials`), so it keeps no copy.
- `admin` gets two memberships (shop owner and installation operator); other accounts hold at most one. Customers hold none, since that role is computed from `verifiedAt`.
- Backup codes are single-use, so the scenario reset restores them.
- `seedCredentials` is computed at import time, so the password config is read once when the module loads.
