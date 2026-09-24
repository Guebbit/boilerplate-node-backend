---
source: scenarios/users.ts
sha256: 24904eef177edd7dea160ebfc7878aa527a60191a4614eddbc10401b7718c42f
generated_at: 2026-09-23T17:20:49.227042+00:00
model: ollama:qwen3.8:27b
---

# scenarios/users.ts

## Purpose

Builds and seeds the full set of demo user documents: four role-specific accounts (admin, customer, editor, moderator) that the e2e suite logs in as, plus ten filler customers that give the flow runner varied order histories. Splits seeding into two entry points so the `blank` scenario can create only the named accounts without a shop-dependent customer base.

## Key elements

- **`seedCustomerId(index)`** — deterministic hex ID generator (fixed prefix + zero-padded index). Avoids time-based `ObjectId` so repeated `scenario:apply` runs upsert the same rows.
- **`SEED_CUSTOMER_IDS`** (exported) — 10 named keys (`amelia` … `isla`) mapped to deterministic IDs. The public contract the flow runner reads instead of raw hex strings.
- **`namedUsers`** (exported) — the four `makeUser` documents for admin/customer/editor/moderator. Each carries `verifiedAt`, a role-appropriate image, and (for `customer`) `analyticsConsent: true` so the analytics e2e test has an opted-in caller.
- **`SEED_CUSTOMER_EMAILS`** (exported) — `Record<keyof SEED_CUSTOMER_IDS, string>` derived from `CUSTOMER_NAMES`; lets the flow runner sign each filler customer in without reconstructing the address.
- **`customerUsers`** (module-local) — 10 `makeUser` documents in the same order as `SEED_CUSTOMER_IDS`. Alternates `analyticsConsent` and image by index.
- **`userFixtures`** (exported) — `[...namedUsers, ...customerUsers]`, the full 14-document set.
- **`seedUsersCollection()`** (exported) — upserts every fixture via `insertIfAbsent(userRepository, …)`, then assigns the `customer` tenant role to the 10 filler accounts via `assignRole`. Returns `SeedOutcome[]`.
- **`seedNamedUsersCollection()`** (exported) — upserts only `namedUsers`; used by the `blank` scenario where no shop (and thus no customer base) exists.

## Relationships

- **`scenarios/accounts.ts`** — source of all `SEED_*_ID / EMAIL / PASSWORD` constants for the four named accounts. This file consumes them; the other file owns the credential values.
- **`scenarios/index.ts`** — registers `seedUsersCollection` in `shopModules`; `seedShop` walks it as part of the full-shop apply.
- **`scenarios/blank.ts`** — calls `seedNamedUsersCollection` instead of the full collection, since `blank` has no shop.
- **`scenarios/flows/shop-history.ts`** — reads `SEED_CUSTOMER_IDS` and `SEED_CUSTOMER_EMAILS` to create varied order/cart histories; signs in as the filler customers using `makeUser`'s default password.
- **`scenarios/seed.ts`** — provides `insertIfAbsent` (idempotent upsert helper) and the `SeedOutcome` type used in both seeding functions.
- **`src/modules/users/factories.ts`** — `makeUser` builds every user document in this file.
- **`src/modules/users/repository.ts`** — `userRepository` is the persistence target for `insertIfAbsent`.
- **`src/modules/access/index.ts`** — re-exports `assignRole`, used here to grant the `customer` tenant role to the 10 filler accounts.
- **`src/kernel/access/tenant.ts`** — supplies `DEPLOYMENT_TENANT_ID`, the tenant scope passed to `assignRole`.

## Notes

- The 10 filler customers have **no** credentials in `@scenarios/accounts`; they log in with whatever default password `makeUser` assigns. Only the four named accounts carry explicit credentials.
- `marcus` is **not** seeded as banned. The `shop-history` flow bans him at runtime via `PUT /users/{id}` so the audit trail records the action rather than a static flag.
- The four named accounts get their tenant role from `@scenarios/accounts`'s `seedAccessModel` (always run first by `seedShop`). Only the 10 filler accounts receive their role here — `seedUsersCollection` assigns it, because no other file does.
- `SEED_CUSTOMER_EMAILS` is **derived from** `CUSTOMER_NAMES` (username → `@example.com`), not stored independently. The cast to `Record<keyof typeof SEED_CUSTOMER_IDS, string>` is a type-narrowing assertion over `Object.fromEntries`.
- Image assignment alternates between the two entries in `users-images.generated.json` by index parity; `root`, `editor`, and `moderator` all reuse the `root` image, while `customer` and odd-indexed fillers use the `customer` image.
