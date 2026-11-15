---
source: scenarios/users.ts
sha256: 5f197fdb1e6b1ce0cf099a761e3d7249ac719b5b65d565dda6139db5ffcd8213
generated_at: 2026-11-14T17:18:48.659757+00:00
model: ollama:qwen3.8:27b
---

# scenarios/users.ts

## Purpose
Seeds the `users` collection for the demo dataset: 13 named persona accounts (one per tenant role in `personas.yaml`) plus 10 filler customers used by the shop-history flow. Exposes the seed entry points that the `blank` and `shop` scenario runners call, and publishes the filler customers' ids and emails so other scenario files can reference them by name.

## Key elements

- **`SEED_CUSTOMER_IDS`** — `as const` map of 10 deterministic user ids (hex-string, prefixed `67f0c2`) keyed by name (`amelia` … `isla`). Deterministic so `scenario:apply` upserts are idempotent.
- **`SEED_CUSTOMER_EMAILS`** — `Record<keyof SEED_CUSTOMER_IDS, string>` derived from `CUSTOMER_NAMES`. Exported so `shop-history.ts` can sign in as these accounts without re-deriving the address.
- **`seedNamedUsersCollection`** — Seeds only the 13 persona accounts (no filler customers). Called by `scenarios/blank.ts`.
- **`shopModule`** — `{ seed: seedUsersCollection }` entry in the generated `shop-modules` table. Picked up by `npm run regenerate`; seeds all 23 users.
- **`userOf(name)`** *(internal)* — Builds one persona user row from `personas.accounts[name]`, mapping state flags (`verified`, `active`, `pendingEmail`, `analyticsConsent`, `authenticator`, `twoFactor`) onto `UserOverrides`.
- **`armedAuthenticator(userId)`** *(internal)* — Returns two-factor overrides with the shared staff TOTP secret, encrypted per-user via `encryptTotpSecret`.
- **`emailTwoFactor()`** *(internal)* — Returns email-2FA overrides with the fixed `SEED_TWO_FACTOR_BACKUP_CODES` hashed under a per-process salt.
- **`customerUsers`** *(internal)* — The 10 filler customers: verified, active, alternating consent/avatar. None is seeded banned.

## Relationships

- **`scenarios/accounts.ts`** — Source of `SEED_IDS`, `seedCredentials`, `SEED_TWO_FACTOR_BACKUP_CODES`, `SEED_STAFF_TOTP_SECRET`. This file consumes those; the ten filler customers are deliberately *not* registered there.
- **`scenarios/personas-schema.ts`** — Provides `personas`, `PERSONA_NAMES`, and the `PersonaName` type that drive the 13 named accounts.
- **`scenarios/seed.ts`** — Supplies `insertIfAbsent` (upsert primitive) and the `SeedOutcome` return type used by both seed functions.
- **`scenarios/blank.ts`** — Calls `seedNamedUsersCollection` as part of the `blank` fixture; never calls `seedUsersCollection`.
- **`scenarios/flows/shop-history.ts`** — Consumes `SEED_CUSTOMER_IDS` and `SEED_CUSTOMER_EMAILS` to sign in as filler customers and vary order history.
- **`src/modules/users/factories.ts`** — `makeUser` builds the user documents; `UserOverrides` type is the shape this file's helper functions return.
- **`src/modules/users/repository.ts`** — `userRepository` is the Mongoose collection handle passed to `insertIfAbsent`.
- **`src/modules/account/two-factor/totp.ts`** — `encryptTotpSecret` binds the shared staff secret to a specific user id.
- **`src/modules/account/two-factor/backup-codes.ts`** — `generateBackupCodeSalt` and `hashBackupCodes` produce the stored digest for email-2FA backup codes.
- **`src/modules/account/consent-record.ts`** — `termsVersion()` stamps the current Terms version on every seeded account.
- **`tests/integration/scenarios/shop.test.ts`** — Integration tests that exercise the seeded users, including the runtime ban of `marcus` via `PATCH /users/{id}`.

## Notes

- The 10 filler customers use `makeUser`'s default password — they are never wired into `@scenarios/accounts`, so no login promise or credential entry exists for them.
- `twoFactorBackupCodeSalt` is generated once per process (`generateBackupCodeSalt()` at module level). The salt and the fixed codes must stay paired; any salt is valid as long as both are used together.
- Filler customer ids use a fixed hex prefix (`67f0c2`) + zero-padded index, never `new Types.ObjectId()`, to keep reseed idempotent.
- No user is seeded in a **banned** state; `marcus` is banned at runtime by `shop-history.ts` so the audit log records the action.
- `userImages` comes from a co-located generated file (`users-images.generated.json`); `demo:remove` deletes those images alongside the seed rows.
- The `shopModule` export is consumed by the code-generated `scenarios/shop-modules.generated.ts`; deleting this file removes its entry on the next `npm run regenerate`.
