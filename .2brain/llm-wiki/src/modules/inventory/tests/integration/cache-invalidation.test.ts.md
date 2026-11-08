---
source: src/modules/inventory/tests/integration/cache-invalidation.test.ts
sha256: 1a8cedc0f7eeb0742c443839771ca78840382675b8a3cd509af37336cb500b73
generated_at: 2026-11-08T06:05:35.830402+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/cache-invalidation.test.ts

## Purpose

Integration test verifying that every stock-mutating operation in the inventory service (receive, adjust, reservation sweep, return restock) triggers a `['products']` cache-tag invalidation. This guards against the catalogue's `GET /products/:id` and list endpoints serving stale `available` counts after a stock write.

## Key elements

- **`describe` block: "the products cache tag, cleared where stock is written"** — four `it` cases, each asserting `invalidateCacheTagsLogged` was called with `['products']` after the respective service call.
- **`anOrderId()`** — module-level counter producing 24-char hex-looking strings (`c`-padded) that satisfy the order-id format without needing a real order.
- **`jest.mock('@infrastructure/adapters/cache', …)`** — replaces `invalidateCacheTagsLogged` with a `jest.fn` (not a spy) while re-exporting the rest of the module via `requireActual`.
- **Sweep test** — creates a hold under `NODE_RESERVATION_TTL_MINUTES: '0'` so it is instantly expired, clears the mock, then calls `inventoryService.runReservationSweep()` and asserts the invalidation.
- **Return test** — wraps `restockReturnedLines` in `withTransaction`, then explicitly calls `refreshStockCacheForProducts` before asserting.

## Relationships

- **`src/modules/inventory/services/index.ts`** — the system under test (`inventoryService.receive`, `.adjust`, `.reserveForOrder`, `.runReservationSweep`, `.restockReturnedLines`, `.refreshStockCacheForProducts`).
- **`src/infrastructure/adapters/cache.ts`** — `invalidateCacheTagsLogged` is the sole assertion target; the module is fully mocked at import time.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` provides the DB session for the return-restock test.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds a product with a given `onHand` value.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the test database before any test runs.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` temporarily sets `NODE_RESERVATION_TTL_MINUTES` for the sweep scenario.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity required by service methods.

## Notes

- The mock uses full module replacement (not `jest.spyOn`) because a CommonJS namespace import exposes a non-configurable getter that `spyOn` cannot redefine (see `tests/support/ports.ts` for the pattern explanation).
- The sweep test relies on a **zero-minute TTL** to make the hold stale without waiting; it clears the mock *after* the reservation call so only the sweep's invalidation is asserted.
- The return test calls `refreshStockCacheForProducts` explicitly after the transactional restock — the invalidation for this path is delegated to that follow-up call rather than happening inside `restockReturnedLines` itself.
