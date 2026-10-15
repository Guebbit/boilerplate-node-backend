---
source: src/modules/orders/tests/integration/service-search.test.ts
sha256: b031680db86d02af6f3cab2e59f6b5a2ac7a7b9565d103d42e64f79fe82c55bb
generated_at: 2026-10-15T11:17:54.027538+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/service-search.test.ts

## Purpose

Integration tests for `orderService.search` — the read path of the order service. Covers the three computed totals (`totalItems`, `totalQuantity`, `totalPrice`) that exist only because the aggregate pipeline derives them, plus all filtering, pagination, live image resolution, and the admin "awaiting transfer" sorting view. Complements `service-crud.test.ts`, which covers the write half (`create`, `update`, `remove`).

## Key elements

- **`describe('orderService.search — derived totals')`** — four cases verifying `totalItems` (distinct product lines), `totalQuantity` (sum of quantities), and `totalPrice` (sum of price × qty) appear on results, including a multi-product composite case.
- **`describe('orderService.search')`** — the main suite: default pagination, filters by `userId`, `email` (exact + case-insensitive), `paymentMethod` + `status`, `id` array, `productId` (embedded item lookup), explicit `page`/`pageSize`, the `scope` parameter (raw Mongoose filter merged into `$match`), and the empty-result shape.
- **`describe('orderService.search — current (live) image')`** — four cases asserting the `current` field on each order item resolves live from the catalogue product: unchanged, replaced-since-purchase, never-had-an-image (`{}`), and hard-deleted (`null`).
- **`describe('orderService.search — the Awaiting-transfer view')`** — verifies sorting by `payBy` ascending for pending bank-transfer orders while excluding other payment methods.

## Relationships

- **`src/modules/orders/services/index.ts`** — the unit under test; all assertions call `orderService.search(...)`.
- **`src/modules/orders/repository.ts`** — indirectly exercised through the service; the `normalize` step in the repository is what materializes the derived totals onto results (bypassed by `.aggregate()`'s `toJSON`).
- **`src/modules/orders/tests/factories.ts`** — provides `createOrder`, `orderRepository`, and `toOrderItem` helpers used to seed test data.
- **`src/modules/products/tests/factories.ts`** — provides `createProduct`, `saveProduct`, `deleteProduct` for catalogue setup and the live-image mutation/deletion tests.
- **`src/modules/users/tests/factories.ts`** — provides `createUser` for order ownership.
- **`tests/support/setup-test-db.ts`** — called once at module top (`setupTestDb()`) to provision/reset the test database before any test runs.

## Notes

- The derived totals are **not** stored on the Mongoose document. They are produced solely by the aggregate pipeline + repository `normalize`. These tests exist specifically to guard that every read path still runs that step.
- The `current` field on order items is resolved **live** from the catalogue product at read time (not frozen at purchase). The order line itself stores no image, so there is no "stale" state to worry about — only the four resolution branches tested here.
- The `scope` parameter on `orderService.search` accepts a raw Mongoose filter object that is merged into the `$match` stage; it is a service-level escape hatch, not part of the public query shape.
- Email filtering is case-insensitive (tested explicitly with mixed-case input).
