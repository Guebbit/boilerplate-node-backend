---
source: src/modules/returns/tests/integration/close-by-hand.test.ts
sha256: dd2ac06bceae317f0799b8093232a9874070be447339b12cdd51f903176823a8
generated_at: 2026-10-29T05:46:43.036122+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/close-by-hand.test.ts

## Purpose

Integration test for the `closeReturnByHand` service action — the manual "way out" for a return that is already in `received` status but whose refund was canceled or settled outside the app (e.g., cashed out at the register). It verifies that the close is idempotent, writes the correct audit/timeline rows, and deliberately suppresses the `RETURN_CLOSED` domain event (whose wording implies money went back).

## Key elements

- **`paidInCash()`** – Fixture helper: creates a user, two products, an order (2× shirt + 1× mug), reserves real inventory, and records an offline CASH payment via `paymentService.recordOfflinePayment`.
- **`paymentOf(orderId)`** – Reads the payment record for an order as an admin.
- **`receivedWithCanceledRefund()`** – Builds the canonical precondition: a delivered cash-paid order, a created return, a received return, then cancels the pending refund via `paymentService.cancelRefund`.
- **`describe('closing a received return by hand')`** – Six tests covering: successful close with audit + timeline + no outbox event; close without a note and action-availability toggle; 409 on double-close; 409 on a `requested` return; 409 on a `canceled` return; 404 for a nonexistent ID.
- **`beforeEach`** – Registers `paymentsModule` and `returnsModule`, resets the audit sink.
- **`afterEach`** – Resets domain events and restores all mocks.

## Relationships

- **`src/modules/returns/services/index.ts`** – Calls `returnService.closeReturnByHand`, `createReturn`, `receiveReturn`, `cancelReturn`, `getReturn`.
- **`src/modules/returns/events.ts`** – Imports `RETURN_CLOSED` to assert it is *not* emitted to the outbox.
- **`src/modules/returns/module.ts`** – Registered as a checkout module in `beforeEach`.
- **`src/modules/payments/index.ts` / `module.ts` / `services/index.ts`** – Uses `paymentService` to record offline payment, cancel a refund, and read payment state.
- **`src/modules/inventory/index.ts` / `services/index.ts`** – Uses `inventoryService.reserveForOrder` to lock stock in the fixture.
- **`src/kernel/outbox.ts`** – Imports `outboxEventModel` and `settleOutboxNudges` to assert no `RETURN_CLOSED` document lands in the outbox.
- **`src/kernel/events.ts`** – Imports `resetDomainEvents` for per-test isolation.
- **`src/infrastructure/observability/audit.ts`** – Imports `registerAuditSink` and the `AuditEntry` type to capture and assert audit rows.
- **`src/modules/orders/tests/factories.ts`** – Uses `createOrder`, `toOrderItem`, `timelineOf` for order setup and timeline assertions.
- **`src/modules/products/tests/factories.ts`** – `createProduct` for SKU fixtures.
- **`src/modules/users/tests/factories.ts`** – `createUser` for the customer.
- **`src/modules/delivery/tests/factories.ts`** – `carryOrderTo` to advance order state to `delivered`.

## Notes

- The test's central invariant: `closeReturnByHand` writes an audit row (`admin.return.closed`) and a timeline row, but does **not** enqueue a `RETURN_CLOSED` outbox event and does **not** touch stock or payment. The absence of the event is asserted explicitly via `outboxEventModel.countDocuments`.
- The audit `metadata.note` field is optional; when omitted, the key must be *absent* (asserted with `not.toHaveProperty('note')`), not present with an empty value.
- `timelineOf(orderId, 'return_closed')` is checked to ensure the timeline row exists but does **not** leak the free-text note (asserted with `not.toContain('cash')`).
- The fixture uses a module-level counter (`customers`) to generate unique emails; it is never reset, so the counter only grows within the test file's lifetime.
