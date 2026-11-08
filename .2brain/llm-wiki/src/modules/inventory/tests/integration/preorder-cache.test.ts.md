---
source: src/modules/inventory/tests/integration/preorder-cache.test.ts
sha256: e2f2203d579deb3cf6ad054620e184c47876be05d27943cea45af62076e51d35
generated_at: 2026-11-08T06:07:00.849861+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/preorder-cache.test.ts

## Purpose
Integration test verifying that when a payment allocates a preorder (backorder), the products module's stock *copy* is refreshed only after the outbox relay delivers the `PREORDER_ALLOCATED` announcement—not directly inside the payer's transaction. Also confirms that a plain (non-preorder) payment triggers no announcement and no copy refresh.

## Key elements

- **`anOrderId()`** – Generates a unique 24-char hex order ID per call (holds are keyed by order ID).
- **`preorderProduct(limit)`** – Creates a product with `onHand: 0` and a backorder allowance, returning its ID.
- **`describe('a payment that serves a preorder')`** – Two tests:
  - *relay refresh*: reserves a backorder hold, commits within a transaction, asserts the copy is unchanged until `relayOutbox()` runs, then asserts `reserved` reflects the allocation.
  - *announcement-only*: same setup but skips the relay and instead calls `emitDomainEvent(PREORDER_ALLOCATED, …)` directly, proving the event alone drives the refresh for the named product.
- **`describe('a payment that serves nothing')`** – Commits a plain in-stock hold inside a transaction; asserts counters update normally and zero `PREORDER_ALLOCATED` rows appear in the outbox.
- **`beforeEach`** – Resets domain events, subscribes the inventory module, and calls `markDomainEventsWired()` (a real boot does this; without it every outbox row stays pending).
- **`afterEach`** – Calls `settleOutboxNudges()` to flush any pending relay work between tests.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/outbox.ts` | Uses `relayOutbox()` to flush the outbox and trigger the copy refresh; `outboxEventModel` to assert no announcement was written; `settleOutboxNudges()` in teardown. |
| `src/kernel/events.ts` | `emitDomainEvent` to fire `PREORDER_ALLOCATED` manually; `markDomainEventsWired` / `resetDomainEvents` for lifecycle. |
| `src/modules/inventory/events.ts` | Imports the `PREORDER_ALLOCATED` event-name constant. |
| `src/modules/inventory/module.ts` | Calls `inventoryModule.subscribe()` in `beforeEach` to wire event handlers. |
| `src/modules/inventory/services/index.ts` | The `inventoryService` under test (`reserveForOrder`, `receive`, `commitForOrder`, `setBackorderLimit`). |
| `src/modules/products/tests/factories.ts` | `createProduct` to seed catalogue data; `countersOf` to read the product's stock copy. |
| `src/infrastructure/runtime/database.ts` | `withTransaction` wraps `commitForOrder` to simulate the payer's atomic transaction. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the test database. |
| `tests/support/callers.ts` | `testCallerContext` supplies the caller identity for `inventoryService.receive`. |

## Notes

- The central invariant under test: **the copy refresh must happen outside the payer's transaction**. The test asserts the copy is *stale* (reserved = 0) immediately after `withTransaction` resolves and only correct after the relay or a direct event emission.
- `markDomainEventsWired()` is a test-only substitute for what a real application boot does; omitting it leaves every outbox row in a pending state and the relay never fires.
- `anOrderId()` pads with the character `'d'` (not `'0'`) so the result is a valid 24-char hex string while remaining visually distinct from real Object IDs.
- The "serves nothing" test asserts both that the *counter* state is correct (reserved = 3) and that no `PREORDER_ALLOCATED` outbox row exists—guarding against spurious announcements on plain payments.
