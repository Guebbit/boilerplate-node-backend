---
source: src/modules/inventory/tests/integration/stock-cache-order.test.ts
sha256: f8a4a0eedaf4cd8373409bc54bc3af7ed00a2dd8cd82cc49adb527eaf0d6816e
generated_at: 2026-11-14T20:10:25.136563+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/stock-cache-order.test.ts

## Purpose

Integration test that guards against a stale cache-write race: if the first buyer's `syncStockCache` write is delayed past the second buyer's completion, the older snapshot must not overwrite the newer one in the product document, and no spurious `PRODUCT_BUYABLE_AGAIN` outbox event may be emitted. The interleaving is forced deterministically with a manual gate rather than relying on thread scheduling.

## Key elements

- **`parkNextCacheWrite()`** – Returns `{ parked, release }`. Spies on `productService.syncStockCache` with `mockImplementationOnce`, resolving `parked` as soon as the call is intercepted and deferring the real call until `release()` is invoked. This makes the "first write lands last" scenario reproducible on every run.
- **`describe('the product copy of the stock counters')`** – Single test case:
  1. Creates a product with `onHand: 2`.
  2. Fires buyer A's `reserveForOrder`, waits on `gate.parked`.
  3. Fires and awaits buyer B's `reserveForOrder`; asserts counters show `reserved: 2, available: 0`.
  4. Calls `gate.release()`, awaits buyer A's promise.
  5. Asserts counters are unchanged and `outboxEventModel` contains zero `PRODUCT_BUYABLE_AGAIN` documents for the product.

## Relationships

- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the in-memory test database before the suite runs.
- **`src/modules/products/tests/factories.ts`** – `createProduct` seeds a product document; `countersOf` reads back the stock counters for assertions.
- **`src/modules/products/index.ts`** – Provides `productService` (the object whose `syncStockCache` method is spied on) and the `PRODUCT_BUYABLE_AGAIN` event-name constant.
- **`src/modules/inventory/services/index.ts`** – The `inventoryService` imported from this barrel is used to drive the `reserveForOrder` calls that exercise the code under test.
- **`src/kernel/outbox.ts`** – `outboxEventModel` is queried to verify no false restock event was queued.

## Notes

- The spy targets a method on a **plain object** (`productService`), not a class instance; the comment notes this keeps `jest.spyOn` compatible with the swc-based mutation-testing harness.
- The two order IDs (`'a'.repeat(24)`, `'b'.repeat(24)`) are arbitrary 24-char hex strings satisfying the ObjectId shape; they carry no semantic meaning.
- `afterEach` calls `jest.restoreAllMocks()` so the one-shot `mockImplementationOnce` never leaks into subsequent tests.
- The file deliberately does **not** test the happy-path (in-order) write; it exists solely to pin the version-guard / last-writer-wins invariant for the stale-write case.
