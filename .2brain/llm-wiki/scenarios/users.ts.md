---
source: scenarios/users.ts
sha256: 2ca446846a243a6543ef3a2308cee6dd8cfb8b51c020347bc4a6e8044b5c7ac6
generated_at: 2026-10-01T12:24:39.200504+00:00
model: ollama:qwen3.8:27b
---

# scenarios/users.ts

## Purpose

Builds the full set of demo user documents for the users collection — named role accounts, state-specific personas, staff, and a ten-person filler customer base — and exposes two seeding entry points: one for the full `apply` scenario and one (named-users only) for the `blank` scenario. All credentials and IDs are sourced from `@scenarios/accounts`; this file is responsible for assembling the documents and writing them idempotently.

## Key elements

- **`seedCustomerId(index)`** — Internal helper that mints a deterministic 24-char hex ID (prefix `67f0c2`) so re-seeding is idempotent; avoids time-based `ObjectId`.
- **`SEED_CUSTOMER_IDS`** (exported) — Named keys (`amelia`…`isla`) mapped to the 10 filler customer IDs.
- **`SEED_CUSTOMER_EMAILS`** (exported) — Same keys mapped to `${username}@example.com` strings; consumed by the flow runner for logins.
- **`personaUsers`** (internal) — Four users in specific account states: unverified, two-factor armed, pending email change, and banned. Written directly to the collection because reaching these states via the API requires mail/code the seeder cannot read.
- **`staffUsers`** (internal) — Four accounts (manager, warehouse, support, operator) built via `makeUser`; roles are assigned separately by `seedAccessModel`.
- **`namedUsers`** (exported) — The four primary accounts (root, customer, editor, moderator) plus `personaUsers` and `staffUsers`. Exported so the `blank` scenario can seed exactly this set.
- **`customerUsers`** (internal) — The 10 filler customers; alternating `analyticsConsent` and avatar images.
- **`userFixtures`** (exported) — `[...namedUsers, ...customerUsers]`; the complete list passed to seeding.
- **`seedUsersCollection()`** (exported) — Idempotent upsert of every fixture via `insertIfAbsent(userRepository, …)`, then assigns the `customer` role (tenant scope) to the 10 filler customers via `assignRole`. Declared in `shop-modules.ts`; walked by `seedShop`.
- **`seedNamedUsersCollection()`** (exported) — Idempotent upsert of `namedUsers` only; called by `scenarios/blank.ts`.

## Relationships

- **`scenarios/accounts.ts`** — Source of every ID, email, password, and the `seedPersonaCredentials` / `seedStaffCredentials` maps consumed here.
- **`scenarios/blank.ts`** — Calls `seedNamedUsersCollection` (not `seedUsersCollection`) to seed users without the filler customer base.
- **`scenarios/flows/shop-history.ts`** — Reads `SEED_CUSTOMER_IDS` and `SEED_CUSTOMER_EMAILS` to log in as the filler customers and exercise varied order histories.
- **`scenarios/seed.ts`** — Provides `insertIfAbsent` and the `SeedOutcome` type used by both seed functions.
- **`scenarios/shop-modules.ts`** — Declares `seedUsersCollection` in its module list so `seedShop` can walk it.
- **`src/modules/users/factories.ts`** — `makeUser` is the document builder for every account in this file.
- **`src/modules/users/repository.ts`** — `userRepository` is the target passed to `insertIfAbsent`.
- **`src/modules/access/index.ts`** — Exports `assignRole`, called to grant the `customer` role to filler customers.
- **`src/kernel/access/tenant.ts`** — Supplies `DEPLOYMENT_TENANT_ID` used in the `assignRole` call.
- **`src/modules/account/two-factor/backup-codes.ts`** — Provides `generateBackupCodeSalt` and `hashBackupCodes` for the two-factor persona's backup codes.

## Notes

- The two-factor persona's salt is generated **once per process** (`generateBackupCodeSalt()` at module load). The digests in `SEED_TWO_FACTOR_BACKUP_CODES` are fixed, so any salt works as long as salt and hashes stay paired. Do not regenerate the salt independently of the codes.
- `SEED_CUSTOMER_EMAILS` is typed via a manual `as Record<…>` cast because `Object.fromEntries` widens to `Record<string, string>`. The type-safety guarantee rests on `CUSTOMER_NAMES` covering every key of `SEED_CUSTOMER_IDS` exactly once.
- The four named accounts (root, customer, editor, moderator) get their **role membership** from `seedAccessModel` in `scenarios/accounts.ts`, not from this file. This file only writes the user documents.
- None of the 10 filler customers is seeded as banned. The `marcus` account is banned at runtime by the `shop-history` flow via `PATCH /users/{id}`, preserving a real audit-trail entry.
- `customer` (the named account) has `analyticsConsent: true` specifically because the paired-frontend e2e test (`analytics.cy.ts`) asserts a `cart_item_added` event; the consent gate is opt-in.
- Filler customers use `makeUser`'s default password — they are not intended to be logged in by a human, only by the flow runner.
