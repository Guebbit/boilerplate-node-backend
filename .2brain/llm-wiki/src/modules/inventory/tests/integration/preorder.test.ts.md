---
source: src/modules/inventory/tests/integration/preorder.test.ts
sha256: 4a2b6f9dcc59c419f5e95ef9a8c422ff7c866554053a052d7bba43f6f2c1da36
generated_at: 2026-11-08T06:07:17.189985+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/integration/preorder.test.ts

## Purpose

Integration tests that exercise the full preorder lifecycle through `inventoryService`: claiming against `backorderLimit` (never touching `onHand`), committing (payment), receiving stock into the queue, and releasing or expiring the claim. Runs against a real database via `setupTestDb`.

## Key elements

- **`anOrderId()`** – returns a unique, hex-padded 24-char string per call; used as the order key for holds.
- **`levelOf(productId)`** – reads the four stock-level counters (`onHand`, `reserved`, `backordered`, `backorderLimit`) for assertions.
- **`preorderProduct(limit)`** – creates a zero-stock, backorder-enabled product and sets its `backorderLimit`; returns the product ID.
- **`claim(productId, quantity)`** – shorthand for a single `{ productId, quantity, kind: 'backorder' }` line item.
- **`announced()`** – reads `PREORDER_ALLOCATED` payloads from the outbox in insertion order.
- **`describe('reserving a preorder')`** – verifies the claim increments `backordered`, rejects over-allowance, rejects products without an allowance, never draws from `onHand`, records a `StockMovementReason.backorder` row, and rolls back on multi-line rejection.
- **`describe('giving a preorder claim back')`** – covers `releaseForOrder`, TTL expiry sweep, `releaseCommittedForOrder`, and partial `releaseLinesForOrder`.
- **`describe('paying for a preorder')`** – verifies `commitForOrder` stamps `committedAt` and immediately allocates if stock already arrived.
- **`describe('a receipt serving the queue')`** – verifies FIFO-by-payment-time allocation, partial-delivery splitting, and that allocated units are not sellable in the interim.

## Relationships

- **`src/modules/inventory/services/index.ts`** – the SUT; all calls go through `inventoryService`.
- **`src/modules/inventory/repository.ts`** – `reservationRepository`, `stockLevelRepository`, `stockMovementRepository` are read directly in assertions.
- **`src/modules/inventory/events.ts`** – `PREORDER_ALLOCATED` event name used to query the outbox.
- **`src/modules/inventory/audit.ts`** – imported (`inventoryAuditActions`); the audit port itself is fully mocked (see Notes).
- **`src/kernel/outbox.ts`** – `outboxEventModel` queried to verify emitted events.
- **`src/infrastructure/runtime/database.ts`** – `withTransaction` used to wrap `releaseLinesForOrder`.
- **`src/types/index.ts`** – `StockMovementReason` enum for movement assertions.
- **`src/modules/products/tests/factories.ts`** – `createProduct` helper for fixture setup.
- **`src/modules/products/index.ts`** – `productService` imported (available for product-side assertions if needed).
- **`src/infrastructure/observability/audit.ts`** – module-level `jest.mock` replaces it with `auditPortMock()`.
- **`tests/support/ports.ts`** – provides the `auditPortMock` factory and `observePort` helper.
- **`tests/support/callers.ts`** – `testCallerContext` and `callerContextAs` for caller identity in `receive` calls.
- **`tests/support/environment.ts`** – `withEnvironmentOverrides` used to force `NODE_RESERVATION_TTL_MINUTES=0` in the expiry test.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the real DB before tests run.

## Notes

- The audit port is **replaced**, not spied on: `jest.mock('@infrastructure/observability/audit', …)` returns a fresh mock via `auditPortMock()`. Do not add `jest.spyOn` on audit inside individual tests.
- `anOrderId()` is a module-level counter, not a UUID generator. Order IDs are deterministic within a test run; tests that need distinct orders rely on the increment.
- Queue allocation order is **by `committedAt` (payment time)**, not by order creation time. The "oldest payment first" test deliberately commits `second` before `first` to prove this.
- `onHand` stock is explicitly **not** eligible for preorder claims, even when a `backorderLimit` is set — the "does not sell the shelf" test guards against conflating the two counters.
- The file is truncated in the graph; the final assertion in "a receipt serving the queue" continues past the visible content (a `StockMovementReason` array check).
