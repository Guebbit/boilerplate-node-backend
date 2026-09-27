---
source: scenarios/subjects.ts
sha256: b54abafe8bc9e4cf1b1fd9249a12e77755e770234ca3c33e2bcd7bf396b4b840
generated_at: 2026-09-27T13:51:19.029697+00:00
model: ollama:qwen3.8:27b
---

# scenarios/subjects.ts

## Purpose

Holds the pinned (hardcoded) IDs and credentials for seeded database rows so that consumers that **cannot import module code** — specifically `scripts/contracts/client-collections-bundle.ts`, which runs before `api/` exists — can still reference a specific row. It is import-free by construction: it must not transitively pull in anything that imports the generated `@api/` client.

## Key elements

- **`SEED_PRODUCT_IDS`** — `as const` map of seven product row IDs, each named for the catalogue branch it exercises (standard, softDeleted, outOfStock, premium, bundleInactive, barebones, digital).
- **`SHOP_SUBJECTS`** — `Readonly<Record<string, string>>` that maps each scenario-guarantee key (e.g. `product.softDeleted`) to the corresponding pinned product ID. Only `product.*` entries appear; every other guarantee names a row produced at runtime by flows.
- **`SUBJECTS`** — `as const` object bundling admin credentials, user credentials, and three representative product row IDs. Credential values are re-exported from `@scenarios/accounts` rather than duplicated.

## Relationships

- **`scenarios/accounts.ts`** — source of the six `SEED_*` credential constants that `SUBJECTS` re-exports.
- **`scenarios/products.ts`**, **`scenarios/wishlist.ts`**, **`scenarios/flows/shop-history.ts`** — consume `SEED_PRODUCT_IDS` instead of repeating raw hex strings.
- **`scenarios/index.ts`** — `buildScenario` merges the pinned subjects exported here with flow-minted IDs into a single map returned by `GET /__test/scenario`.
- **`scripts/contracts/client-collections-bundle.ts`** — reads this file's exports during `npm run contracts:bundle`; the import-free constraint on this file exists specifically for this consumer.

## Notes

- **Only pinned rows live here.** Orders, payments, and shipments are produced by driving the app (`scenarios/flows/`); their IDs are minted at boot and recorded by the runner. A consumer that needs an order ID must call `GET /__test/scenario` or chain a list request — it cannot be a literal in this file.
- **Bidirectional enforcement.** `tests/integration/scenarios/shop.test.ts` asserts that `SHOP_SUBJECTS` keys equal the guarantees declared in each module's `module.ts` in both directions: an orphan guarantee or a leftover subject key fails the suite.
- **Credential single-source-of-truth.** Credentials are re-exported from `@scenarios/accounts` so they stay in lockstep with the paired frontend's `.env` copy. Do not duplicate them here.
- **The import-free constraint is load-bearing.** Adding an import that transitively reaches the generated `@api/` client will break `npm ci` the same way the cycle documented in `scripts/contracts/openapi-bundle.ts` did.
