---
source: scenarios/users.ts
source_sha256: 432bc993bf1d052721b6391d04ab141e5c9a66ab2e224ee18cb12d0872e20dea
context_sha256: 77f80b9da6f893f01d94164ef69bca21624d84656603d8a87d9ddf58e5fbc59b
generated_at: 2026-11-22T01:50:06.057619+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/users.ts

## Purpose
Seeds the `users` collection of the demo dataset. It builds the 13 named persona accounts from `shared/scenarios/personas.yaml` (root owner, customer, one per newer tenant role, personas and staff) plus ten further filler customers, so the flow runner can vary order history across more than one shopper. It exports the seed functions and customer id/email tables that other scenario files use.

## Key elements
- `SEED_CUSTOMER_IDS` – exported map of ten customer names (`amelia` … `isla`) to deterministic ids produced by the private `seedCustomerId(index)`. The ids are hex strings with a fixed `67f0c2` prefix, so reseeding is idempotent.
- `SEED_CUSTOMER_EMAILS` – exported map of the same keys to `<username>@example.com`, derived from the private `CUSTOMER_NAMES` list.
- `userOf(name)` – builds a persona's user row with `makeUser`. Ids come from `SEED_IDS`, credentials from `seedCredentials`, and the state flags from `personas.accounts[name].state`. Those flags control the following:
  - `verified` sets `verifiedAt`.
  - `active` can set `active: false`.
  - `pendingEmail` sets the pending email.
  - `analyticsConsent` sets consent and its date.
  - `authenticator` arms TOTP.
  - `twoFactor` arms email 2FA.
  - Every account gets Terms acceptance (`termsAcceptedAt`, `termsVersion`).
  - Accounts with an authenticator get `userImages.root`; all others get `userImages.customer`.
- `armedAuthenticator(userId)` – returns TOTP 2FA fields. The shared `SEED_STAFF_TOTP_SECRET` is encrypted with `encryptTotpSecret`, and the method entry's `_id` is the user id.
- `emailTwoFactor()` – returns email-2FA fields. The fixed `SEED_TWO_FACTOR_BACKUP_CODES` are hashed with a per-process salt from `generateBackupCodeSalt()`.
- `namedUsers` – `PERSONA_NAMES` mapped through `userOf`.
- `customerUsers` – the ten customers, verified and active, with analytics consent and images alternating by index parity. Passwords use `makeUser`'s default.
- `userFixtures` – `namedUsers` followed by `customerUsers`.
- `seedUsersCollection()` – upserts all fixtures via `insertIfAbsent(userRepository, …)`.
- `seedNamedUsersCollection()` – exported. Seeds only the named accounts.
- `shopModule` – exported `{ seed: seedUsersCollection }` entry for the `shop` fixture table.

## Relationships
- `scenarios/accounts.ts`: source of `SEED_IDS`, `seedCredentials`, `SEED_TWO_FACTOR_BACKUP_CODES` and `SEED_STAFF_TOTP_SECRET`. It also holds the login promises for the named accounts.
- `scenarios/personas-schema.ts`: provides `personas`, `PERSONA_NAMES` and the `PersonaName` type that drive `userOf`.
- `scenarios/seed.ts`: provides `insertIfAbsent` and `SeedOutcome`.
- `src/modules/users/factories.ts`: `makeUser` and the `UserOverrides` type.
- `src/modules/users/repository.ts`: `userRepository`, the write target.
- `src/modules/account/consent-record.ts`: `termsVersion()`.
- `src/modules/account/two-factor/backup-codes.ts` and `totp.ts`: backup-code salting and hashing, and TOTP secret encryption.
- `scenarios/blank.ts`: its `seedBlank` calls `seedNamedUsersCollection`.
- `scenarios/flows/shop-history.ts`: reads `SEED_CUSTOMER_IDS` and `SEED_CUSTOMER_EMAILS` to shop as the filler customers, logging in with `makeUser`'s default password.
- `tests/integration/scenarios/shop.test.ts`: a graph neighbor. The file's content doesn't show how the test uses it.

## Notes
- Customer ids are deterministic on purpose. A time-based `new Types.ObjectId()` would break the idempotent `scenario:apply` upsert.
- The filler customers have no login promise in `@scenarios/accounts`.
- `marcus` is deliberately seeded unbanned. The owner bans them later through `PATCH /users/{id}`, so the audit trail records the ban.
- Seeded rows are written straight to the collection, because reaching these states through the API would need mail or codes the seeder doesn't read.
- Timestamps use `new Date()`, so they differ between runs. Row ids stay stable.
- The module is picked up by `npm run regenerate` into the generated shop-modules table (`./shop-modules`), so deleting this file removes its entry.
