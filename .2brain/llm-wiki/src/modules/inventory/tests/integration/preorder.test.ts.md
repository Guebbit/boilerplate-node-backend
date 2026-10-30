---
source: src/modules/inventory/tests/integration/preorder.test.ts
sha256: 4dc4c700b94f9ad99cd540e935052e310853b2e7145f3905d2998e553a933588
generated_at: 2026-10-29T04:08:08.363815+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/preorder.test.ts

## Purpose

End-to-end integration tests for the preorder (backorder) flow driven entirely through the public `inventoryService` API. Covers the full lifecycle: claiming against `backorderLimit`, refusing over-claims, releasing on cancel/expiry, committing (payment), and receipt allocation with FIFO-by-payment-order and partial-delivery splitting.

## Key elements

- **`anOrderId()`** — Generates a unique, 24-char hex order ID per call; reservations are keyed by this.
- **`levelOf(productId)`** — Reads the three stock-level counters (`onHand`, `reserved`, `backordered`) plus `backorderLimit` via `stockLevelRepository`.
- **`preorderProduct(limit)`** — Creates a zero-stock, backorder-eligible product and sets its `backorderLimit` via `inventoryService.setBackorderLimit`.
- **`claim(productId, quantity)`** — Shorthand for a single backorder line item (`kind: 'backorder'`).
- **`announced()`** — Reads `PREORDER_ALLOCATED` payloads from the outbox in insertion order; used to assert event ordering and `waiting` counts.
- **`describe('reserving a preorder')`** — Verifies claim hits `backordered` (never `onHand`/`reserved`), shortfall reporting, no-allowance refusal, shelf-stock isolation, stock-movement ledger entry, and multi-line atomicity (rollback when one line is refused).
- **`describe('giving a preorder claim back')`** — Release, TTL-expiry sweep, committed-cancel, and partial-line release all restore the allowance without touching `reserved`.
- **`describe('paying for a preorder')`** — Commit stamps `committedAt`; immediate allocation if stock already arrived while unpaid.
- **`describe('a receipt serving the queue')`** — FIFO by payment time (not order creation), partial-delivery split, and atomicity (no intermediate sellable window between backorder→stock transition).

## Relationships

- **`src/modules/inventory/services/index.ts`** (`inventoryService`) — the primary SUT; every assertion flows through its public methods (`reserveForOrder`, `releaseForOrder`, `commitForOrder`, `receive`, `releaseCommittedForOrder`, `releaseLinesForOrder`, `runReservationSweep`, `setBackorderLimit`).
- **`src/modules/inventory/repository.ts`** — `stockLevelRepository`, `reservationRepository`, `stockMovementRepository` are used directly to assert internal state that the service does not return.
- **`src/modules/inventory/events.ts`** (`PREORDER_ALLOCATED`) — event name constant used to filter outbox rows.
- **`src/kernel/outbox.ts`** (`outboxEventModel`) — queried to verify emitted events and their order.
- **`src/infrastructure/runtime/database.ts`** (`withTransaction`) — wraps `releaseLinesForOrder` to test partial-line release inside a caller-supplied session.
- **`src/modules/products/tests/factories.ts`** (`createProduct`) — creates the product fixture.
- **`src/modules/products/index.ts`** (`productService`) — imported (likely for product setup/verification not visible in truncated portion).
- **`tests/support/setup-test-db.ts`** (`setupTestDb`) — initialises the real MongoDB instance before all suites.
- **`tests/support/environment.ts`** (`withEnvironmentOverrides`) — overrides `NODE_RESERVATION_TTL_MINUTES` to `0` for the expiry-sweep test.
- **`tests/support/callers.ts`** (`testCallerContext`) — caller identity passed to `inventoryService.receive`.
- **`src/infrastructure/observability/audit.ts`** — mocked at the module level (see Notes).
- **`tests/support/ports.ts`** — supplies the `auditPortMock` used in the `jest.mock` factory; `observePort` also imported.
- **`src/types/index.ts`** (`StockMovementReason`) — enum values asserted in stock-movement queries.
- **`src/modules/inventory/audit.ts`** (`inventoryAuditActions`) — imported; likely used for assertion setup in the truncated portion.

## Notes

- **Audit is replaced, not spied.** The `jest.mock` call swaps the entire `@infrastructure/observability/audit` module for the mock from `tests/support/ports.ts`. Code that imports the audit port at the top level will receive the mock, not the real implementation.
- **Real database, not in-memory.** `setupTestDb()` provisions a real MongoDB; tests rely on document `_id` insertion order for FIFO assertions.
- **Order ID format matters.** `anOrderId()` produces a 24-character hex string (MongoDB ObjectId-compatible). Anything shorter may break repository lookups.
- **FIFO is by `committedAt`, not by reservation creation order.** The "oldest payment first" test explicitly creates two orders where the second is paid first and asserts it is served first.
- **Backorder and shelf stock are independent pools.** A test explicitly verifies that 50 units of `onHand` do not extend a `backorderLimit` of 2; a 3-unit claim is still refused.
