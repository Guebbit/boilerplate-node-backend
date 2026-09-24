---
source: scenarios/subjects.ts
sha256: 334a80068933cd0301709239199056bf530c0df76c2b4def86957b5a1cb76e6f
generated_at: 2026-09-23T17:20:01.837643+00:00
model: ollama:qwen3.8:27b
---

# scenarios/subjects.ts

## Purpose

Provides the fixed (pinned) seed-row identifiers and credentials that a consumer needs to reference a specific seeded database row without importing any application module code. It exists as an import-free constants module so that build-time tooling (specifically `scripts/contracts/client-collections-bundle.ts`) can read it before the `api/` package or generated `@api/` client exists on disk.

## Key elements

- **`SEED_PRODUCT_IDS`** – `as const` object mapping descriptive names (`dogFoodStandard`, `heaterSoftDeleted`, `scratchPostOutOfStock`, `dogBedPremium`, `bundleInactive`, `barebones`) to their MongoDB hex ids. Each name encodes the product *and* the edge-case branch it exists to exercise.
- **`SHOP_SUBJECTS`** – `Readonly<Record<string, string>>` that maps scenario-guarantee keys (e.g. `'product.softDeleted'`, `'product.inStock'`) to the corresponding `SEED_PRODUCT_IDS` entries. This is the answer to the manifest question for the `shop` scenario; only product subjects appear here because all other guarantees reference rows produced at runtime by flows.
- **`SUBJECTS`** – `as const` object bundling admin and user credentials (id, email, password) plus a representative product block. All credential values are re-exported from `@scenarios/accounts` to keep a single source of truth aligned with the paired frontend's `.env`.

## Relationships

- **`scenarios/accounts.ts`** – Source of the `SEED_ADMIN_*` and `SEED_USER_*` constants imported at the top of this file.
- **`scenarios/products.ts`**, **`scenarios/wishlist.ts`**, **`scenarios/flows/shop-history.ts`** – Consumers that read `SEED_PRODUCT_IDS` instead of hard-coding hex strings.
- **`scenarios/index.ts`** – Its `buildScenario` function merges the pinned subjects exported here with the ids minted at boot by flow runners into a single map served by `GET /__test/scenario`.
- **`scripts/contracts/client-collections-bundle.ts`** – Reads this file (and `@scenarios/accounts`) during `npm run contracts:bundle`; the import-free constraint on this file exists specifically to satisfy that build step before `api/` is generated.

## Notes

- **Import-free invariant.** This file must never import code that transitively pulls in the generated `@api/` client. A previous cycle through `scripts/contracts/openapi-bundle.ts` broke `npm ci`; the constraint is structural, not stylistic.
- **Pinned vs. dynamic.** Only rows that exist *before* any process runs live here. Orders, payments, and shipments are produced by driving `scenarios/flows/`, so their ids are recorded by the runner and are **not** valid as literals in this file.
- **Bidirectional guarantee check.** `tests/integration/scenarios/shop.test.ts` asserts that every guarantee a module declares in its `module.ts` (`AppModule.scenario`) has a matching key in `SHOP_SUBJECTS`, and vice-versa. Adding or removing a guarantee without updating this map (or vice-versa) fails the suite.
