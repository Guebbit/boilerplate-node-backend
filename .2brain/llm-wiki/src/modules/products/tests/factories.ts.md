---
source: src/modules/products/tests/factories.ts
sha256: 4ed7295d13fa64a82ccc586bfcfcd3a38d68376bad3e5959e3c818b2d748ddc6
generated_at: 2026-10-15T11:47:01.439759+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/products/tests/factories.ts

## Purpose

Test-database persistence layer for the products module. It wraps the in-memory `makeProduct` builder (one level up in `../factories.ts`) with actual DB writes and a small set of read/mutate helpers so that checkout, cart, delivery, and account test suites can create, inspect, and clean up product fixtures without importing the production barrel or reaching into sibling modules.

## Key elements

- **`makeProduct` / `ProductOverrides`** (re-export) — the pure in-memory builder and its overrides type, so callers need only one import path.
- **`productRepository`** (re-export) — the live repository object, exposed so a test can `jest.spyOn` the real binding that `productService` calls internally.
- **`createProduct(overrides?)`** — inserts a product via `productRepository.create`, then seeds the `stocklevels` collection row. Defaults `onHand` to 10 (sellable) so the common "has stock" case doesn't require per-call-site pinning.
- **`seedStockLevel(product)`** (private) — upserts into the raw `stocklevels` collection by string name, mirroring the fields `@modules/inventory`'s `$lookup` reads. Bypasses the `PRODUCT_CREATED` event for speed.
- **`readProduct(id)`** — hydrates a stored document via `productRepository.findById`.
- **`saveProduct(document)`** — persists an already-mutated in-memory document.
- **`deleteProduct(document)`** — removes a product; used for cleanup or negative-path fixtures.
- **`countersOf(productId)`** — reads the raw `onHand`/`reserved`/`available` triple via `productService.findByIdRaw` and computes `available` with the shared `availableStock` helper.

## Relationships

- **Consumed by** cart integration/contract tests (`checkout`, `merge`, `stock`, `preorder`, `upsert-retry`, `line-availability`, `totals`, `service`, `stock-flag`), delivery contract tests, account shop contract tests, and addresses checkout integration tests. All use `createProduct` to seed a fixture product and `countersOf`/`readProduct` to assert persisted state after a domain operation.
- **Depends on** `../factories` (the BUILDER), `../model` (`productModel` for the raw collection access), `../repository` (`productRepository`), `../domain/stock` (`availableStock`), and `../services` (`productService.findByIdRaw`).
- **Touches `stocklevels` by string name** to avoid importing `@modules/inventory`; this is the same collection-name convention the inventory module's `$lookup` uses in the reverse direction.

## Notes

- `onHand` defaults to **10**, not 0. The schema default of 0 is correct for real writes but makes most checkout tests trivially fail. A test that specifically needs zero stock must pass `onHand: 0` explicitly.
- `seedStockLevel` uses `$setOnInsert`, so a pre-existing `stocklevels` row (e.g. from a prior test) is **not** overwritten. Tests that need a clean slate should delete the product first (`deleteProduct`).
- `countersOf` reads via `productService.findByIdRaw`, which is the untransformed stored document. Do not confuse this with a domain-model read that might apply virtuals or service-level mapping.
- The file intentionally re-exports `productRepository` rather than wrapping its methods, because `jest.spyOn` on a wrapper function copies the call, not the binding, and would miss internal `productService` calls.
