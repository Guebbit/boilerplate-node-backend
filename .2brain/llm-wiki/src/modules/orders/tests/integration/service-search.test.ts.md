---
source: src/modules/orders/tests/integration/service-search.test.ts
sha256: 3dc2c1cede5bb6f59bd04bac1d0b92ff75680fc70efeeb15cab1d99996d2870a
generated_at: 2026-09-27T15:20:06.452892+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-search.test.ts

## Purpose

Integration tests for `orderService.search` that verify filtering, pagination, the three aggregate-derived totals (`totalItems`, `totalQuantity`, `totalPrice`), and live catalogue image resolution (`current.imageUrl`). Complements `service-crud.test.ts`, which covers the write path (`create`, `update`, `remove`).

## Key elements

- **`describe('orderService.search — derived totals')`** — asserts that `totalItems` (distinct product-line count), `totalQuantity` (sum of quantities), and `totalPrice` (Σ price × qty) appear on every search result, including multi-product orders.
- **`describe('orderService.search')`** — covers default pagination, filters by `userId`, `email` (exact + case-insensitive), `paymentMethod`, `id` (array), `productId` (embedded), explicit `page`/`pageSize`, the `scope` parameter (raw Mongoose `$match` merge), and the empty-result edge case.
- **`describe('orderService.search — current (live) image')`** — verifies that `items[].current.imageUrl` is resolved live from the catalogue: unchanged product returns the stored URL, a modified product returns the new URL, and a hard-deleted product yields `null`.

## Relationships

- **`src/modules/orders/services/index.ts`** — the system under test; all assertions call `orderService.search`.
- **`src/modules/orders/tests/factories.ts`** — provides `createOrder` and `toOrderItem` for seeding order fixtures.
- **`src/modules/products/tests/factories.ts`** — provides `createProduct`, `saveProduct`, `deleteProduct` for catalogue fixtures and the live-image mutation/deletion tests.
- **`src/modules/users/tests/factories.ts`** — provides `createUser` for order-owner fixtures.
- **`tests/support/setup-test-db.ts`** — called at module top-level (`setupTestDb()`) to provision an isolated MongoDB instance before any test runs.

## Notes

- The three totals are **not persisted** on the order document; they are produced by an aggregation pipeline and attached by the repository's `normalize` step. These tests exist specifically to guarantee that every read path runs that step.
- The `email` filter is case-insensitive (tracked as **PL-29**); the test uses `'ALICE@Example.com'` against a stored `'alice@example.com'`.
- The `scope` parameter is a raw Mongoose filter object merged into the `$match` stage — it is **not** a validated DTO field.
- `current.imageUrl` is resolved at read time from the live catalogue document; order lines store no image snapshot, so there is no "stale" state to worry about — only changed-or-deleted.
