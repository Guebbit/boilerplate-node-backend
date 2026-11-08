---
source: src/modules/returns/tests/integration/close-by-hand.test.ts
sha256: 5c3f15d90ed8198328597fcd7588db776421a075e663a99e31d90bbfe9d4a608
generated_at: 2026-11-08T08:08:03.417876+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/close-by-hand.test.ts

## Purpose

Integration tests for `returnService.closeReturnByHand`, the manual-close path for a `received` return whose refund was settled outside the app (e.g., cash given at the counter). Verifies the state transition to `closed`, the audit trail, the timeline row, and—critically—that **no** `RETURN_CLOSED` outbox event is emitted and no money or stock moves.

## Key elements

- **`paidInCash()`** — Creates a user, two products, an order, reserves inventory, and records an offline cash payment. Returns the fixture bundle.
- **`paymentOf(orderId)`** — Reads the payment document for an order via `paymentService.getForOrder`.
- **`receivedWithCanceledRefund()`** — Builds the full pre-condition: delivered cash order → created return → received → refund canceled. Returns `{ orderId, returnId, … }`.
- **`describe('closing a received return by hand')`** — Six test cases:
  - Successful close: asserts `status === 'closed'`, `closedAt` set, exactly one `admin.return.closed` audit row with the note, one timeline row (note text *not* in it), and **zero** `RETURN_CLOSED` outbox documents.
  - Close without a note: `actions.close` is `true` before and `false` after; audit metadata has no `note` key.
  - Double close: second call → `409 RETURN_NOT_CLOSABLE`, no additional audit row, no additional timeline row.
  - Refuses a `requested` return: `409 RETURN_NOT_CLOSABLE`.
  - Refuses a `canceled` return: `409 RETURN_NOT_CLOSABLE`.
  - Non-existent return: `404`.

## Relationships

- **`src/modules/returns/services/index.ts`** — `returnService` is the system under test (`closeReturnByHand`, `createReturn`, `receiveReturn`, `cancelReturn`, `getReturn`).
- **`src/modules/returns/module.ts`** — `returnsModule` registered in the checkout module graph so the service is wired.
- **`src/modules/returns/events.ts`** — `RETURN_CLOSED` name queried against the outbox collection to assert its *absence*.
- **`src/kernel/outbox.ts`** — `outboxEventModel` and `settleOutboxNudges` used to flush and count pending events.
- **`src/kernel/events.ts`** — `resetDomainEvents` called in `afterEach`.
- **`src/infrastructure/observability/audit.ts`** — `registerAuditSink` captures audit rows into the local `audited` array for assertions.
- **`src/modules/payments/module.ts`** / **`src/modules/payments/services/index.ts`** — `paymentsModule` registered; `paymentService` used for `recordOfflinePayment`, `cancelRefund`, and `getForOrder`.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`, `timelineOf`.
- **`src/modules/delivery/tests/factories.ts`** — `carryOrderTo` to advance the order to `delivered`.
- **`src/modules/inventory/index.ts`** — `inventoryService.reserveForOrder` to hold real units.
- **`src/modules/products/tests/factories.ts`** — `createProduct`.
- **`src/modules/users/tests/factories.ts`** — `createUser`.

## Notes

- The central assertion is **negative**: `outboxEventModel.countDocuments({ name: RETURN_CLOSED })` must be `0`. This distinguishes "close by hand" from the refund-driven close, which *does* emit that event.
- The operator's free-text note is persisted **only** in the audit metadata (`metadata.note`), not in the timeline row. The test explicitly checks that the JSON-serialised timeline row does not contain the note string.
- `audited` is re-cleared (`audited = []`) mid-test in the double-close and first-success cases to isolate the rows written by the action under test from the setup phase.
- `closeReturnByHand` is gated to the `received` status only; the `actions.close` flag on the return document is the UI-facing gate and is asserted to flip from `true` → `false`.
