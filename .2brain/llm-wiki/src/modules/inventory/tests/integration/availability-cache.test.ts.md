---
source: src/modules/inventory/tests/integration/availability-cache.test.ts
source_sha256: 9160909aa591ad1f1be659b8fdaa6237ddf3e4e3e990b7eda503bfe558a705c6
context_sha256: 096eb2bd7cf926a8caf1665cf9e1b59f3fcfda62d2224af769d17328c620b553
generated_at: 2026-11-22T05:25:17.657317+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/integration/availability-cache.test.ts

## Purpose
Integration tests for the per-product availability cache (60-second TTL) behind `GET /products/:id/availability`. They verify that every change to a product's stock or sale state clears the entry for the changed product, so the next read returns the new answer instead of a stale `in_stock`. The routes, service, stock funnel, outbox and listeners are real. Only the cache adapter's value functions are replaced.

## Key elements
- `mockEntries` and the `jest.mock('@infrastructure/adapters/cache', ...)` block: replace `getCacheValues`, `setCacheValue` and `deleteCacheValues` with a `Map` that records each key's value and TTL. The rest of the adapter stays real (`requireActual`). Without Redis the real adapter returns `undefined` for every read, so every request would miss.
- `keyOf(id)`: builds the cache key `availability:<id>`.
- `setOnProduct(id, fields)`: changes `purchasable` or `releaseDate` directly in the database, so no event is emitted.
- `readAs(id, bearer?)`, `statusOf`, `availabilityOf`: read the availability route as a guest or with a bearer token, and return the response, the status or the `availability` string.
- Test cases:
  - Stores the entry with TTL 60 on a miss, and a hit does not query the database.
  - A stock adjustment (`POST /inventory/levels/:id/adjust`) clears only that product's entry.
  - `PATCH /products/:id` with `purchasable: false` clears the entry via the outbox.
  - Soft-delete and restore each clear the entry.
  - `inventoryService.forgetAvailability([id])` clears the entry even when the product has no level row (`removeLevel`).
  - A payment that serves a preorder: `commitForOrder` inside a transaction leaves the entry alone. Only `nudgeOutbox()` plus `settleOutboxNudges()`, which deliver `inventory.backorder_allocated`, clear it.
  - After the entry expires (simulated by deleting it), a release date that has passed shows `in_stock`.
  - A guest never gets a hidden (inactive) product from a cache hit, while an admin still does.
  - A malformed cached value (`'not json'`) is treated as a miss and rebuilt.

## Relationships
- `@tests/setup-test-db` (`setupTestDb`): sets up the test database.
- `@tests/http` (`api`, `authenticateAs`): perform HTTP requests and authenticate as an admin.
- `@modules/products/tests/factories` (`createProduct`, `readProduct`, `saveProduct`) and `../factories` (`removeLevel`): create and manipulate test data directly.
- `@kernel/outbox` (`nudgeOutbox`, `settleOutboxNudges`): drive and await outbox delivery, so event-based cache deletions can be asserted.
- `inventoryService` (`../../services`): `forgetAvailability`, `setBackorderLimit`, `reserveForOrder`, `receive` and `commitForOrder` are called directly.
- `@infrastructure/runtime/database` (`withTransaction`): wraps `commitForOrder` in a transaction.
- `@tests/callers` (`testCallerContext`): the caller context passed to `receive`.

## Notes
- `mockEntries` is cleared in `beforeEach`.
- The expiry test does not wait 60 seconds. It deletes the entry by hand, and the TTL value itself is asserted in the first test.
- Cache deletes cannot be rolled back, so the preorder case checks that the clear happens only after the transaction commits, through the outbox event.
