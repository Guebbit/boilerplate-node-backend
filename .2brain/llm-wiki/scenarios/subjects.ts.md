---
source: scenarios/subjects.ts
sha256: 0fa947dccbda9d4c00cb803cc60070ff9f7c6f2d4bae5e8a74d1a69cf2c303e9
generated_at: 2026-10-14T07:01:53.987215+00:00
model: ollama:qwen3.8:27b
---

# scenarios/subjects.ts

## Purpose

Provides the pinned (statically known) row IDs and credentials that consumers unable to import app code — e.g. generated API-client collections — still need to target a specific seeded row. It also serves as the declarative "answer" to the scenario manifest: exactly one product ID per guarantee a `shop` module declares in its `module.ts`, verified in both directions by the integration suite.

## Key elements

- **`SEED_PRODUCT_IDS`** (`as const`) — Named MongoDB hex IDs for the product catalogue rows each scenario branch needs (soft-deleted, out-of-stock, digital, heavy, low-stock, no-withdrawal, off-sale, barebones, premium, standard, inactive-bundle). Consumed by `products.ts`, `wishlist.ts`, and `flows/shop-history.ts` so no file repeats a raw hex string.
- **`SHOP_SUBJECTS`** (`Readonly<Record<string, string>>`) — Maps each `shop` scenario guarantee key (e.g. `product.softDeleted`, `product.digital`) to the corresponding `SEED_PRODUCT_IDS` value. Only `product.*` keys appear; every other guarantee references a row the flows produce at runtime.
- **`SUBJECTS`** (`as const`) — The admin and user credentials (id, email, password) re-exported from `@scenarios/accounts`, plus a representative `product` block (one standard, one soft-deleted, one inactive ID) that generated examples draw from for a working request.

## Relationships

- **`scenarios/accounts.ts`** — Sole import source; provides `SEED_ADMIN_*` and `SEED_USER_*` credentials.
- **`scenarios/products.ts`**, **`scenarios/wishlist.ts`**, **`scenarios/flows/shop-history.ts`** — Read `SEED_PRODUCT_IDS` instead of duplicating hex literals.
- **`scenarios/index.ts`** — `buildScenario` merges this file's pinned subjects with the IDs minted by running the flows into a single map served at `GET /__test/scenario`.
- **`scripts/contracts/client-collections-bundle.ts`** — The bundler that loads the generated collections consuming this file; guarded by `.dependency-cruiser.bootstrap.cjs` so it never transitively imports from `api/`.

## Notes

- **Only pinned rows live here.** Orders, payments, and shipments are produced by driving the app through `scenarios/flows/`; their IDs are minted at boot and recorded by the runner. A consumer wanting an order ID must call `GET /__test/scenario` or chain a list request — it cannot be a literal in this file.
- **Bidirectional test lock.** `tests/integration/scenarios/shop.test.ts` asserts `SHOP_SUBJECTS` equals the set of guarantees declared in the `shop` module's `module.ts` in both directions: a declared-but-unpinned guarantee fails the suite, and a subject with no matching declaration also fails.
- **Credentials are intentionally re-exported, not duplicated.** `@scenarios/accounts` is the single place admin/user credentials must stay fixed against the paired frontend's own `.env` copy.
