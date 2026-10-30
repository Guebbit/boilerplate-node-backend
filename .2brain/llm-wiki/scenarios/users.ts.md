---
source: scenarios/users.ts
sha256: 15170d3a48c9860630ce394be3a3e4c4a82bae7101c1bbc1993114df52efd19e
generated_at: 2026-10-29T01:27:51.946914+00:00
model: ollama:qwen3.8:27b
---

# scenarios/users.ts

## Purpose

Builds and seeds the full user directory for the demo dataset: 13 named accounts (one per persona in `personas.yaml`, covering every tenant role) and 10 filler customers used to vary order history in the shop flow runner. Accounts carry varied states (verified, 2FA-armed, consented, inactive) so that e2e suites and integration tests can log in as each one rather than only reading about the role.

## Key elements

- **`SEED_CUSTOMER_IDS`** — Deterministic hex-string IDs for the 10 filler customers, keyed by name (`amelia` … `isla`). Never `new Types.ObjectId()`; the prefix `67f0c2` keeps the namespace distinct from product filler IDs.
- **`SEED_CUSTOMER_EMAILS`** — `@example.com` emails for the same 10, exported so the flow runner can sign them in without reconstructing addresses.
- **`seedNamedUsersCollection()`** — Seeds only the 13 named accounts via `insertIfAbsent`. Called exclusively by `scenarios/blank.ts`.
- **`shopModule`** — `{ seed: seedUsersCollection }` entry consumed by `shop-modules.generated.ts` and run by `seedShop`. Seeds all 23 accounts (named + filler).
- **`userOf(name)`** (internal) — Maps a persona's `state` flags (verified, active, pendingEmail, consent, authenticator, 2FA) onto a `makeUser` row.
- **`armedAuthenticator(userId)`** / **`emailTwoFactor()`** (internal) — Produce the `twoFactorMethods`, backup-code, and timestamp overrides for TOTP- and email-based 2FA.

## Relationships

- **`scenarios/accounts.ts`** — Source of `SEED_IDS`, `seedCredentials`, `SEED_TWO_FACTOR_BACKUP_CODES`, `SEED_STAFF_TOTP_SECRET`; provides the ids and passwords this file never invents on its own.
- **`scenarios/personas-schema.ts`** — `personas` and `PERSONA_NAMES` drive which accounts exist and what state flags each carries.
- **`scenarios/seed.ts`** — `insertIfAbsent` provides the idempotent upsert; re-running against a seeded DB is a no-op.
- **`scenarios/blank.ts`** — Calls `seedNamedUsersCollection` so the blank fixture has the 13 accounts but none of the filler customers.
- **`scenarios/flows/shop-history.ts`** — Reads `SEED_CUSTOMER_IDS` / `SEED_CUSTOMER_EMAILS` to shop as the 10 filler customers; none has a login in `@scenarios/accounts`.
- **`scenarios/shop-modules.generated.ts`** — Codegen collects the `shopModule` export; deleting this file removes the entry.
- **`src/modules/users/factories.ts`** — `makeUser` builds each user document; `UserOverrides` types the 2FA and consent fields.
- **`src/modules/users/repository.ts`** — `userRepository` is the target of every `insertIfAbsent` call.
- **`src/modules/account/two-factor/backup-codes.ts`** — `generateBackupCodeSalt` and `hashBackupCodes` arm the email-2FA persona's fixed codes.
- **`src/modules/account/two-factor/totp.ts`** — `encryptTotpSecret` encrypts the shared staff TOTP secret bound to a specific account ID.

## Notes

- **Deterministic IDs are load-bearing.** `seedCustomerId` pads a fixed hex prefix so `scenario:apply`'s upsert is idempotent. Replacing it with `new Types.ObjectId()` would break idempotency on every reseed.
- **Backup-code salt is per-process.** `generateBackupCodeSalt()` runs once at module load. The fixed codes (`SEED_TWO_FACTOR_BACKUP_CODES`) stay valid as long as the salt and digests are written in the same run.
- **Filler customers have no `@scenarios/accounts` entry.** They log in with `makeUser`'s default password; no credentials are stored in the accounts fixture.
- **`marcus` is never seeded banned.** The ban is performed at runtime via `PATCH /users/{id}` so the audit log records the action rather than a pre-existing flag.
- **Image assignment is intentional.** Named 2FA-armed accounts get `userImages.root`; filler customers alternate between the two images by index parity. `demo:remove` deletes these seed images.
