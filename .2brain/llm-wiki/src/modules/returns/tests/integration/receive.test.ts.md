---
source: src/modules/returns/tests/integration/receive.test.ts
sha256: 759f3f4e25b266f5822b8ee9f33b5f1fb665369671d7ad04a7fc34fa4d965493
generated_at: 2026-11-08T08:09:35.231208+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/receive.test.ts

## Purpose

Integration test for the "receive return" operation. It exercises the full flow—status transition, inventory restock, payment refund, and return closure—against a real database and a fake payment provider, verifying that the restock and status write are transactional, the refund is opened on the payment *before* the provider is called and carries the return's id, and a provider-refused refund is eventually resolved rather than left stuck.

## Key elements

- **`paidAndDelivered`** – Fixture helper: creates a user, two products (shirt ×2, mug ×1), an order, reserves stock via `inventoryService`, confirms a card payment, and carries the order to `delivered`. Optionally parameterises shipping and mug tax class.
- **`approvedReturn`** – Opens a return (optionally limited to specific lines) via `returnService.createReturn`, approves it if the reason is not `withdrawal`, then flushes outbox nudges so acknowledgement/decision emails land before the test body runs.
- **`paymentOf` / `wireOrder`** – Small readers that pull the payment or the order's wire projection (resolved JSON) and throw loudly on failure.
- **`describe('the statuses the order shows beside its own')`** – Asserts `returnStatus` and `paymentStatus` transitions on the order projection: `none → in_progress → returned`, and the partial variants (`partially_returned`, `partially_refunded`).
- **`describe('goods excluded from the right of withdrawal')`** – Verifies that a `noWithdrawal` item does not block the order from reaching `returned` once the withdrawable goods are back, and that the shipping charge is retained by the shop.
- **`describe('receiving a return')`** – Core assertions: restock quantities via `countersOf`, single restock movement per line with the return id in the note, refund amount and linkage (`returnId`), payment status staying `succeeded` for partial returns, and domain-event emission order (`RETURN_RECEIVED` before `RETURN_CLOSED`).
- **Mocks** – `enqueueEmail` (mailer) is jest-mocked and cleared per test; the audit port is fully *replaced* (not spied on) via `@tests/ports`.

## Relationships

- **`src/modules/inventory/services/index.ts`** – `inventoryService.reserveForOrder` sets up real stock in the fixture; `inventoryService.listMovements` verifies restock movements after receive.
- **`src/modules/delivery/tests/factories.ts`** – `carryOrderTo` advances the order to `delivered` so the return has a delivered item to work against.
- **`src/kernel/events.ts`** – `onDomainEvent` / `resetDomainEvents` subscribe to and clear domain events to assert emission order.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushes outbox-driven side-effects (e.g. transactional emails) before assertions.
- **`src/infrastructure/adapters/mailer.ts`** – `enqueueEmail` is mocked; the test relies on it *not* sending real mail and clears it in `beforeEach`.
- **`src/infrastructure/observability/audit.ts`** – Replaced entirely with a port mock (see `tests/support/ports.ts` for rationale); no real audit writes occur.
- **`src/modules/invoicing/module.ts` / `services/index.ts`** – `invoicingModule` is registered via `registerCheckoutModules`; `invoicingService` and `CreditNoteDocument` are imported (used in truncated portions, likely for credit-note assertions on full returns).
- **`src/modules/orders/index.ts` / `services/index.ts`** – `orderService` imported; `readOrder` (from tests/factories) is the primary order reader used in assertions.
- **`src/kernel/access/tenant.ts`** – `DEPLOYMENT_TENANT_ID` provides the tenant scope for operations in this single-tenant test environment.
- **`src/modules/access/tests/factories.ts`** – `seedMembership` sets up tenant membership so callers pass access checks.

## Notes

- The audit port is **replaced**, not spied on—the file comment points to `tests/support/ports.ts` for why (likely to avoid real I/O or to capture calls without side-effects).
- `settleOutboxNudges()` must be called after setup steps that enqueue outbox items (e.g. after `approvedReturn`) so that side-effects like emails complete before the test body asserts.
- `eventually(...)` is used where a state transition is asynchronous/eventual (e.g. `paymentStatus` flipping to `partially_refunded` after the provider call resolves), rather than relying on a synchronous return.
- Event-order assertions (`events.toSorted()`) confirm `received` fires before `closed`; this is a behavioural contract, not just an existence check.
- The test file is truncated; additional `describe` blocks (likely covering provider-refused refund recovery and the invoicing/credit-note path) exist beyond the visible portion.
