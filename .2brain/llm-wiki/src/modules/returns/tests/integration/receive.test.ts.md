---
source: src/modules/returns/tests/integration/receive.test.ts
sha256: 4520997ba0be060fcf3b6f3d266ba3b17d77af5425690e35bd8aedd79a2d8f44
generated_at: 2026-10-29T05:48:10.713394+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/receive.test.ts

## Purpose

Integration tests for the `receiveReturn` operation: they verify, against a real database and a fake payment provider, that the status transition, inventory restock, and refund open on the payment are one coherent transaction; that a provider-refused return is eventually closed when the refund lands; and that partial or withdrawal-excluded returns settle correctly.

## Key elements

- **`paidAndDelivered`** – Fixture helper that creates a customer, products (two shirts @ 30, one mug @ 10), an order, reserves inventory, creates + confirms a card payment intent, and advances the order to *delivered* via `carryOrderTo`. Returns the handles needed for assertions.
- **`approvedReturn`** – Creates a return via `returnService.createReturn` and, for non-withdrawal reasons, approves it. Calls `settleOutboxNudges()` so acknowledgement/decision emails are flushed before the test asserts.
- **`paymentOf` / `wireOrder`** – Read helpers: fetch the payment record or the order's JSON projection, throwing loudly on missing data.
- **`describe('the statuses…')`** – Asserts `returnStatus` / `paymentStatus` on the order projection through the *requested → in_progress → returned* lifecycle, including partial-refund states.
- **`describe('goods excluded from the right of withdrawal')`** – Verifies a `noWithdrawal` line is excluded from the refund amount and the delivery charge is retained, while the order still reads *returned* once the withdrawable lines are back.
- **`describe('receiving a return')`** – The core suite: confirms stock is restored (counters), a single restock movement per line carries the return id in `note` and order id in `reference`, the refund object on the payment carries `returnId`, domain events `RETURN_RECEIVED` → `RETURN_CLOSED` fire in order, and partial returns leave the payment *succeeded* with only `amountRefunded` increased.
- **Mocks** – `enqueueEmail` (mailer) is a `jest.fn`; the audit port is fully replaced with `auditPortMock()` from `@tests/ports`.

## Relationships

- **`src/modules/returns/services` / `module` / `repository` / `events`** – The SUT: `returnService.receiveReturn`, `RETURN_RECEIVED`/`RETURN_CLOSED` events, and the return record.
- **`src/modules/inventory` / `inventory/services`** – `inventoryService.reserveForOrder` (setup) and `inventoryService.listMovements` (assert restock rows).
- **`src/modules/payments` / `payments/module`** – `paymentService` for intent creation, confirmation, and `getForOrder` to inspect refunds; `paymentsModule` registered in `beforeEach`.
- **`src/modules/invoicing` / `invoicing/module` / `invoicing/services`** – `invoicingModule` registered; `invoicingService` and `CreditNoteDocument` type imported (used in the truncated portion for credit-note assertions).
- **`src/modules/delivery/tests/factories`** – `carryOrderTo` drives the order to *delivered* without stubbing delivery internals.
- **`src/kernel/events`** – `onDomainEvent` / `resetDomainEvents` for event-order assertions.
- **`src/kernel/outbox`** – `settleOutboxNudges` flushes outbox-driven side-effects (e-mails) so they don't leak into assertions.
- **`src/kernel/access/tenant`** – `DEPLOYMENT_TENANT_ID` imported for tenant-scoped calls (used in the truncated section).
- **`src/modules/access/tests/factories`** – `seedMembership` (truncated section) to grant a caller the required role.
- **`src/infrastructure/adapters/mailer`** – Mocked; tests assert `mockEnqueueEmail` call counts/payloads.
- **`src/infrastructure/observability/audit`** – Replaced with `auditPortMock()`; tests can inspect audit entries without hitting a real sink.

## Notes

- The audit port is **replaced**, not spied on — the comment in-file points to `tests/support/ports.ts` for the rationale (the real adapter has side-effects that would interfere).
- `setupTestDb()` runs once; each test gets a clean slate via the test runner, not a per-test migration.
- `registerCheckoutModules([paymentsModule, invoicingModule, returnsModule])` is called in `beforeEach`; forgetting to register a module here is the most common cause of "port not found" errors in this file.
- `eventually(…)` is a polling helper for eventual-consistency assertions (e.g., partial-refund status that arrives via an async outbox nudge). It is **not** a retry wrapper for synchronous logic.
- The `customers` module-level counter guarantees unique e-mail addresses across tests within the file, avoiding collisions if the DB state is not perfectly isolated.
- Partial-return tests expect the payment status to remain `succeeded` (not `refunded`); only the *order* projection flips to `partially_refunded` / `partially_returned`.
