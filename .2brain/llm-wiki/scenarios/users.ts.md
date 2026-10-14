---
source: scenarios/users.ts
sha256: c4df254427901f65cf97587305cd1595119baceea624cb510c0988811d9588db
generated_at: 2026-10-14T07:06:49.728784+00:00
model: ollama:qwen3.8:27b
---

# scenarios/users.ts

## Purpose

Seeds the user collection for the demo and blank scenarios. It builds every account the demo needs — the four named login accounts (root, customer, editor, moderator), five persona accounts in specific email/2FA/ban states, four staff accounts, and ten filler customers that give the flow runner a varied order history — then exposes two seed functions: one for the full set and one for the named subset used by the `blank` scenario.

## Key elements

- **`seedCustomerId(index)`** — Returns a deterministic hex string for a filler customer ID, avoiding `ObjectId`'s time-based default so `scenario:apply` upserts stay idempotent.
- **`SEED_CUSTOMER_IDS`** (exported) — Named map of the ten filler customer IDs (`amelia`…`isla`). Read by `scenarios/flows/shop-history.ts` instead of raw hex.
- **`SEED_CUSTOMER_EMAILS`** (exported) — Pre-built email per filler customer, keyed the same way as `SEED_CUSTOMER_IDS`. Exported so the flow runner can sign each one in without deriving an address from the username.
- **`personaUsers`** — Five user documents each in a distinct state: unverified, 2FA-armed (with hashed backup codes), pending email change, banned (`active: false`), and a plain second shopper. Written directly to the collection because reaching those states via API would require mail or codes the seeder doesn't read.
- **`staffUsers`** — Four verified accounts (manager, warehouse, support, operator) for shop and platform roles.
- **`namedUsers`** (exported) — The four test-critical accounts plus all persona and staff users. This is the set `seedNamedUsersCollection` writes.
- **`customerUsers`** — The ten filler customers built from `CUSTOMER_NAMES`, with alternating `analyticsConsent` and avatar.
- **`userFixtures`** (exported) — Concatenation of `namedUsers` and `customerUsers`; the full demo roster.
- **`seedUsersCollection()`** (exported) — Upserts every fixture via `insertIfAbsent`, then assigns the `customer` role to the ten filler customers via `assignRole`. Called by `seedShop` through the `shopModules` list.
- **`seedNamedUsersCollection()`** (exported) — Upserts only `namedUsers`. Called by `scenarios/blank.ts`'s `seedBlank`.

## Relationships

- **`scenarios/accounts.ts`** — Sole source of all IDs, emails, passwords, and the `seedPersonaCredentials` / `seedStaffCredentials` objects. This file never hard-codes a credential.
- **`scenarios/seed.ts`** — Supplies `insertIfAbsent` and the `SeedOutcome` type used by both seed functions.
- **`scenarios/blank.ts`** — Calls `seedNamedUsersCollection` to seed users without the filler customer base (blank has no shop).
- **`scenarios/shop-modules.ts`** — Registers `seedUsersCollection` in the module array that `seedShop` walks.
- **`scenarios/flows/shop-history.ts`** — Reads `SEED_CUSTOMER_IDS` and `SEED_CUSTOMER_EMAILS` to sign in as filler customers and create varied order histories.
- **`src/modules/users/factories.ts`** — Provides `makeUser`, the document factory used for every account in this file.
- **`src/modules/users/repository.ts`** — Provides `userRepository`, the insert target for `insertIfAbsent`.
- **`src/modules/access/index.ts`** — Provides `assignRole`, used to grant the `customer` role to the ten filler customers.
- **`src/kernel/access/tenant.ts`** — Provides `DEPLOYMENT_TENANT_ID` passed to `assignRole`.
- **`src/modules/account/two-factor/backup-codes.ts`** — Provides `generateBackupCodeSalt` and `hashBackupCodes` for the 2FA persona's stored codes.
- **`tests/integration/scenarios/shop.test.ts`** — Integration tests that exercise the seeded users end-to-end.

## Notes

- Filler customer IDs are hand-rolled hex strings (`67f0c2` + zero-padded index), **not** `ObjectId`, specifically so re-seeding is idempotent. Do not replace them with `new Types.ObjectId()`.
- The ten filler customers use `makeUser`'s default password; they have **no** entry in `@scenarios/accounts` and no login credentials attached. `shop-history.ts` signs them in with that default.
- The `customer` account carries `analyticsConsent: true` because the paired-frontend e2e test (`analytics.cy.ts`) asserts a `cart_item_added` event that requires opt-in consent.
- `marcus` (filler index 7) is **not** seeded banned. The flow bans her at runtime via `PATCH /users/{id}` so the audit log records the ban as an event rather than a static row.
- Named accounts get their role from `seedAccessModel` (run by `@scenarios/accounts` before this file); only the ten filler customers need the `assignRole` call inside `seedUsersCollection`.
- `SEED_CUSTOMER_EMAILS` uses a type assertion over `Object.fromEntries` because TypeScript cannot prove that `CUSTOMER_NAMES` covers every key of `SEED_CUSTOMER_IDS` exactly once.
