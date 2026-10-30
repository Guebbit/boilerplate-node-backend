---
source: src/modules/inventory/tests/integration/preorder-cache.test.ts
sha256: e2f2203d579deb3cf6ad054620e184c47876be05d27943cea45af62076e51d35
generated_at: 2026-10-29T04:07:50.262533+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/preorder-cache.test.ts

## Purpose

Integration tests for the preorder-allocation → catalogue-refresh flow. A preorder payment moves inventory counters inside the payer's transaction, where the product's catalogue copy cannot be written; the hold's owner announces `PREORDER_ALLOCATED` and the relay refreshes the copy. These tests verify that refresh happens (and only happens for preorders) via the outbox/relay path.

## Key elements

- **`beforeEach`** — resets domain-event state, subscribes the inventory module, and calls `markDomainEventsWired()` so outbox rows can settle (a real boot does this; the test must replicate it).
- **`afterEach`** — flushes pending outbox nudges via `settleOutboxNudges()`.
- **`anOrderId()`** — returns a unique 24-char hex string (MongoDB ObjectId shape) per call; holds are keyed by this value.
- **`preorderProduct(limit)`** — creates a product with `onHand: 0`, `allowBackorder: true`, and a backorder limit of `limit`; returns its id.
- **Test: "leaves the catalogue copy to the relay…"** — full end-to-end: reserve backorder → receive stock → `commitForOrder` inside `withTransaction` → assert counters are still stale → `relayOutbox()` → assert counters reflect the allocation.
- **Test: "is refreshed by the announcement alone…"** — same setup, but triggers the refresh by directly calling `emitDomainEvent(PREORDER_ALLOCATED, …)` instead of going through the outbox relay.
- **Test: "moves no counter and announces nothing"** — non-backorder reservation + commit; asserts counters update immediately and no `PREORDER_ALLOCATED` outbox row is written.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` bootstraps the in-memory Mongo instance.
- **`tests/support/callers.ts`** — supplies `testCallerContext` to `inventoryService.receive`.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds test products; `countersOf` reads back the catalogue copy for assertions.
- **`src/kernel/outbox.ts`** — `relayOutbox()` plays the relay role; `outboxEventModel.countDocuments` asserts no event was enqueued; `settleOutboxNudges` cleans up.
- **`src/kernel/events.ts`** — `resetDomainEvents`, `markDomainEventsWired`, `emitDomainEvent` control the in-process event bus.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` simulates the payer's transaction boundary (the window in which the catalogue copy cannot be written).
- **`src/modules/inventory/module.ts`** — `inventoryModule.subscribe()` wires the module's `PREORDER_ALLOCATED` listener that performs the refresh.
- **`src/modules/inventory/services/index.ts`** — `inventoryService` provides `reserveForOrder`, `receive`, `commitForOrder`, `setBackorderLimit`.
- **`src/modules/inventory/events.ts`** — `PREORDER_ALLOCATED` constant used in assertions and direct emission.

## Notes

- `markDomainEventsWired()` in `beforeEach` is load-bearing: without it every outbox row stays `pending` and `relayOutbox()` delivers nothing, making the first test fail silently.
- The first test asserts an intermediate "stale" state (reserved: 0) between `commitForOrder` and `relayOutbox()` to pin down that the refresh is **not** synchronous with the transaction.
- `anOrderId()` always pads with `'d'` (a digit) rather than a hex char to keep the string unambiguously non-numeric, though any 24-char string would satisfy the syntactic constraint.
