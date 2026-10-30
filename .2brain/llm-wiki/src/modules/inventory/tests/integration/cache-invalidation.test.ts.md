---
source: src/modules/inventory/tests/integration/cache-invalidation.test.ts
sha256: 1a8cedc0f7eeb0742c443839771ca78840382675b8a3cd509af37336cb500b73
generated_at: 2026-10-29T04:06:45.524526+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/cache-invalidation.test.ts

## Purpose

Integration test verifying that every stock-mutating operation in `inventoryService` (receive, adjust, reservation sweep, return restock) triggers a cache invalidation on the `'products'` tag. It exists to catch regressions where a write path forgets to clear the catalogue's response cache, which would leave `GET /products/:id` and list endpoints serving stale `available` counts until TTL expiry.

## Key elements

- **`anOrderId()`** — module-level counter that yields a syntactically valid 24-char hex order ID per call.
- **`jest.mock('@infrastructure/adapters/cache', …)`** — replaces only `invalidateCacheTagsLogged` with a `jest.fn` (resolving `Promise.resolve()`), keeping all other exports via `requireActual`.
- **`setupTestDb()`** — initialises a real test database (not an in-memory stub) so the service exercises its actual persistence path.
- **`describe('the products cache tag, cleared where stock is written')`** — four `it` blocks, one per write path:
  - *receive*: `inventoryService.receive` → asserts `invalidateCacheTagsLogged` called with `['products']`.
  - *adjust*: `inventoryService.adjust` → same assertion.
  - *sweep*: sets `NODE_RESERVATION_TTL_MINUTES` to `'0'` via `withEnvironmentOverrides` so the hold is instantly stale, then runs `runReservationSweep()` and asserts invalidation.
  - *return restock*: wraps `restockReturnedLines` in `withTransaction`, then calls `refreshStockCacheForProducts`; asserts the same tag was invalidated.

## Relationships

- **`src/modules/inventory/services/index.ts`** — the system under test; all four operations are methods on `inventoryService`.
- **`src/infrastructure/adapters/cache.ts`** — the module mocked; only `invalidateCacheTagsLogged` is replaced, the rest is loaded verbatim.
- **`src/infrastructure/runtime/database.ts`** — provides `withTransaction`, used to scope the return-restock test.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds a fixture product with a given `onHand` count.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` temporarily sets `NODE_RESERVATION_TTL_MINUTES` for the sweep test.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity required by service methods.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` seeds the real test database once per module.

## Notes

- The mock uses `jest.mock` rather than `jest.spyOn` because a CommonJS namespace import exposes a non-configurable getter that `jest.spyOn` cannot redefine (see `tests/support/ports.ts`).
- The return-restock path is the only one that calls `refreshStockCacheForProducts` explicitly; the other three rely on the service internally triggering invalidation. The test asserts the same observable contract (`invalidateCacheTagsLogged` called with `['products']`) regardless of which mechanism fires.
- The sweep test uses a zero-minute TTL window, so the hold is expired the instant it is taken — no real waiting is needed.
