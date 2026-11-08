---
source: scenarios/users.ts
sha256: 15170d3a48c9860630ce394be3a3e4c4a82bae7101c1bbc1993114df52efd19e
generated_at: 2026-11-08T02:35:59.017994+00:00
model: ollama:qwen3.8:27b
---

# scenarios/users.ts

## Purpose

Seeds the `users` collection for the demo dataset: the 13 named persona accounts (owner, customer, staff, and one per tenant role) plus 10 filler customers that give the flow runner a varied order history. It exists so other scenario files can seed rows *belonging* to these people and so the e2e suite has accounts to log in against.

## Key elements

- **`SEED_CUSTOMER_IDS`** (exported) — 10 deterministic ObjectIds (hex strings derived from an index, prefixed `67f0c2`) for the filler customers. Not random; safe for idempotent reseed.
- **`SEED_CUSTOMER_EMAILS`** (exported) — maps the same 10 keys to `@example.com` addresses. Exposed so the flow runner can sign in without re-deriving the address.
- **`seedNamedUsersCollection`** (exported) — seeds only the 13 persona accounts via `insertIfAbsent`. Called exclusively by `scenarios/blank.ts`.
- **`shopModule`** (exported) — `{ seed: seedUsersCollection }` entry consumed by the generated `shop-modules.generated.ts` table.
- **`userOf(name)`** (internal) — builds a user row from a `personas.yaml` entry, applying state flags (verified, active, pending email, consent, authenticator, email 2FA, avatar).
- **`armedAuthenticator(userId)`** (internal) — returns 2FA overrides with the shared staff TOTP secret encrypted and bound to the account id.
- **`emailTwoFactor()`** (internal) — returns email-2FA overrides using the fixed backup codes hashed under a per-process salt.
- **`seedCustomerId(index)`** (internal) — deterministic hex id for filler customers; never `new Types.ObjectId()` to preserve idempotent upsert.
- **`customerUsers`** (internal) — the 10 filler customer rows: verified, active, alternating consent/avatar, default password.
- **`userFixtures`** (internal) — combined array `[...namedUsers, ...customerUsers]` used by `seedUsersCollection`.

## Relationships

- **`scenarios/accounts.ts`** — provides `SEED_IDS`, `seedCredentials`, `SEED_TWO_FACTOR_BACKUP_CODES`, `SEED_STAFF_TOTP_SECRET`; this file is the *user* side of that contract.
- **`scenarios/personas-schema.ts`** — source of `personas`, `PERSONA_NAMES`, and the `PersonaName` type; drives which 13 accounts exist and what state each is in.
- **`scenarios/blank.ts`** — calls `seedNamedUsersCollection` to populate users without the filler base (blank has no shop).
- **`scenarios/flows/shop-history.ts`** — reads `SEED_CUSTOMER_IDS` and `SEED_CUSTOMER_EMAILS` to sign in as the ten fillers and create varied order history.
- **`scenarios/seed.ts`** — provides `insertIfAbsent` (idempotent upsert) and the `SeedOutcome` type used by every seed function here.
- **`src/modules/users/factories.ts`** — `makeUser` builds every user row; `UserOverrides` type shapes the 2FA/consent/avatar fields.
- **`src/modules/users/repository.ts`** — `userRepository` is the Mongoose repository passed to `insertIfAbsent`.
- **`src/modules/account/two-factor/backup-codes.ts`** — `generateBackupCodeSalt` and `hashBackupCodes` are used to store the fixed backup codes.
- **`src/modules/account/two-factor/totp.ts`** — `encryptTotpSecret` encrypts the shared staff secret bound to each account id.
- **`tests/integration/scenarios/shop.test.ts`** — integration test that exercises the shop flow whose user fixtures this file provides.

## Notes

- **Deterministic IDs, not `ObjectId()`** — `seedCustomerId` produces a fixed hex string per index. Using the default time-based `ObjectId` would yield a different id on every reseed and break `scenario:apply`'s idempotent upsert.
- **Filler customers are not in `@scenarios/accounts`** — none of the ten has a login promise or explicit password; they authenticate with `makeUser`'s built-in default. Only the 13 named accounts have credentials in `seedCredentials`.
- **Backup-code salt is per-process, not per-run** — `generateBackupCodeSalt()` runs once at module load. The stored codes are fixed, so any salt works as long as the salt and digests are written together in the same process.
- **`marcus` is deliberately not seeded banned** — the ban is applied at runtime via `PATCH /users/{id}` so the audit log records the action rather than a pre-set flag.
- **`shopModule` is auto-collected** — `npm run regenerate` scans for this export to build `shop-modules.generated.ts`; deleting the file removes the entry automatically.
- **Type cast on `SEED_CUSTOMER_EMAILS`** — `Object.fromEntries` widens to `Record<string, string>`; the `as` cast is load-bearing because TypeScript cannot verify that `CUSTOMER_NAMES` covers every key of `SEED_CUSTOMER_IDS` exactly once.
