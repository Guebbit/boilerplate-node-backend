---
source: src/modules/inventory/tests/integration/cache-invalidation.test.ts
sha256: 6482b08e8d3cf9705f562d777c0a6bb7b255dc4cdd049ba4b70f1c2cd05f1311
generated_at: 2026-10-14T16:01:03.790959+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/cache-invalidation.test.ts

## Purpose

Integration test that asserts every stock-writing operation (receipt, adjustment, reservation sweep, return restock) calls `invalidateCacheTagsLogged` with the `'products'` tag. It guards against a regression where a cached `GET /products/:id` response would keep serving a stale `available` count until the TTL expired.

## Key elements

- **`describe('the products cache tag, cleared where stock is written')`** – single suite with four `it` blocks, one per stock-write path.
- **`jest.mock('@infrastructure/adapters/cache', …)`** – factory mock that spreads `requireActual` and replaces `invalidateCacheTagsLogged` with a `jest.fn` resolving `undefined`. All other cache exports remain real.
- **`anOrderId()`** – module-level helper returning a unique 24-char hex string (MongoDB ObjectId shape) per call.
- **`setupTestDb()`** – invoked at module scope to prepare the test database before any test runs.
- **`beforeEach`** – calls `mockClear()` on the mocked `invalidateCacheTagsLogged` so each assertion is isolated.

## Relationships

- **`src/infrastructure/adapters/cache.ts`** – the module under test; `invalidateCacheTagsLogged` is the single function being verified. The entire module is mocked at the `jest.mock` level.
- **`src/modules/inventory/services/index.ts`** – barrel re-export; the test imports `reserveForOrder`, `runReservationSweep`, `receive`, `adjust`, `restockReturnedLines`, and `refreshStockCacheForProducts` from here.
- **`src/modules/inventory/services/admin.ts`** – expected origin of `receive` and `adjust`.
- **`src/modules/inventory/services/reserve.ts`** – expected origin of `reserveForOrder`.
- **`src/modules/inventory/services/sweep.ts`** – expected origin of `runReservationSweep`.
- **`src/modules/inventory/services/returns.ts`** – expected origin of `restockReturnedLines`.
- **`src/modules/products/tests/factories.ts`** – supplies `createProduct`, the sole way a product document enters the test DB.
- **`tests/support/environment.ts`** – supplies `withEnvironment`, used in the sweep test to force `NODE_RESERVATION_TTL_MINUTES=0` so the hold is instantly expired.
- **`tests/support/setup-test-db.ts`** – supplies `setupTestDb` for database lifecycle.

## Notes

- The cache module is **replaced via `jest.mock` factory**, not spied on. A comment in the file explains that `jest.spyOn` fails because the CommonJS namespace import exposes a non-configurable getter. If you add a new export from `cache.ts` and the test breaks, check this mock's spread first.
- The **return test** calls `refreshStockCacheForProducts([productId])` *after* `restockReturnedLines`. The assertion therefore validates the refresh helper, not the restock itself. If `restockReturnedLines` is later changed to invalidate directly, this test still passes but the `refresh` call becomes redundant.
- The **sweep test** depends on the TTL env var being `"0"`; it does not use a timer or fake clock. The `withEnvironment` helper restores the previous value after the `await` block.
- `orderCounter` is **not reset** between tests; each generated ID is unique for the duration of the Jest worker process.
