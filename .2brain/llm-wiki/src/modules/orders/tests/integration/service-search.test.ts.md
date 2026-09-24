---
source: src/modules/orders/tests/integration/service-search.test.ts
sha256: faf79fdec3a4910e7a820729526f840ec2c28d189276f6110e3b645a0cc6afed
generated_at: 2026-09-23T19:12:37.708215+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-search.test.ts

## Purpose

Integration tests for `orderService.search` — the read path of the orders service. Covers the three computed totals that only exist because the aggregate pipeline derives them (`totalItems`, `totalQuantity`, `totalPrice`), all supported filter fields, pagination, the raw `scope` parameter, and the live-image resolution (`current`) that depends on the catalogue product still existing. Complements `service-crud.test.ts`, which exercises the write half (`create`, `update`, `remove`).

## Key elements

- **`describe('orderService.search — derived totals')`** — four tests asserting `totalItems` (distinct line count), `totalQuantity` (sum of quantities), and `totalPrice` (Σ price × qty) appear on every search result, including a multi-product composite case.
- **`describe('orderService.search')`** — the main filter/pagination block:
  - Default (no-filter) call returns all orders.
  - Filters: `userId`, `email` (exact), `paymentMethod` + `status`, `id` (array), `productId` (embedded line match).
  - Pagination via `page` / `pageSize`, verifying `meta.totalItems` and `meta.totalPages`.
  - `scope` parameter — a raw Mongoose filter merged into the `$match` stage.
  - Empty-dataset edge case.
- **`describe('orderService.search — current (live) image')`** — three branches for the `current` field on each order line: product unchanged, product replaced after purchase, product hard-deleted (→ `null`).
- **`setupTestDb()`** — called once at module level before any test runs.

## Relationships

- **`src/modules/orders/services/index.ts`** — the system under test; imported as `* as orderService` and only `search` is exercised here.
- **`src/modules/orders/model.ts`** — the Order schema whose aggregate pipeline / `applyOrderTransform` produces the computed totals and the `current` lookup; tests assert the post-normalisation shape without importing the model directly.
- **`src/modules/orders/tests/factories.ts`** — provides `createOrder` and `toOrderItem` to seed fixtures.
- **`src/modules/products/tests/factories.ts`** — provides `createProduct`, `saveProduct`, `deleteProduct` for catalogue setup and the live-image mutation tests.
- **`src/modules/users/tests/factories.ts`** — provides `createUser` for owner fixtures.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb` for the in-memory / isolated DB lifecycle.

## Notes

- The computed totals are **not stored** on the document. They appear only because the repository's `normalize` step (downstream of `.aggregate()`) applies `applyOrderTransform`. The tests exist specifically to catch a regression where a read path skips that step.
- Order lines carry **no image** of their own. The `current.imageUrl` field is always resolved live from the catalogue product at read time; the "replaced" test mutates the product after the order exists to prove this.
- The `scope` parameter (second argument to `search`) is a raw Mongoose filter object, not a typed query shape — tests pass `{ userId: ObjectId }` directly.
- The file header comment explicitly names `service-crud.test.ts` as its write-path counterpart; keep them in sync if the service surface changes.
