---
source: src/modules/returns/tests/integration/receive.test.ts
sha256: 67233a36655e6a83221d3e11d07fa268cfe05a9a015a6bd16421b3f2d262d21d
generated_at: 2026-11-14T21:45:43.214434+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/receive.test.ts

## Purpose

Integration test for the **receive-return** operation (`returnService.receiveReturn`). It exercises the full side-effect chain against a real test database: inventory restock, refund creation on the payment provider, order/return status transitions, domain-event emission order, and refund due-date stamping. It exists to catch cross-module regressions (payments, inventory, invoicing, outbox) that unit tests cannot see.

## Key elements

- **`paidAndDelivered(shipping?, shippingMethod?, mugTaxClass?)`** – Fixture helper. Creates a user, two products (shirt × 2, mug × 1), an order, inventory reservation, a confirmed card payment, and advances the order to `delivered`. Returns the entities for later assertions.
- **`approvedReturn(fixture, reason?, lines?)`** – Opens a return via `returnService.createReturn`, approves it (unless withdrawal), and calls `settleOutboxNudges()` so acknowledgement/decision emails land. Returns the return id.
- **`paymentOf(orderId)`** / **`wireOrder(orderId)`** – Thin helpers that fetch the payment or the wire-shaped order (resolved projections) or throw.
- **`describe('the statuses the order shows beside its own')`** – Asserts `returnStatus` progression (`none → in_progress → returned`) and `paymentStatus` (`paid → refunded`, or `partially_refunded` for partial returns).
- **`describe('goods excluded from the right of withdrawal')`** – Verifies that a `noWithdrawal` item does not block `returned` status, and that the shipping charge is retained in the refund amount.
- **`describe('receiving a return')`** – Core assertions:
  - Stock counters restore to original `onHand` values.
  - Payment shows a succeeded refund carrying the return id.
  - `RETURN_RECEIVED` then `RETURN_CLOSED` events fire in order.
  - Refund due-date stamp uses `withdrawalRefundDueBy(requestedAt, shopTimezone())`.
  - A return received > 14 days after request gets a due date of "now".
- **Mocks** – `enqueueEmail` (mailer) is a plain jest mock; the audit port is *replaced* via `jest.requireActual('@tests/ports').auditPortMock()` (see `tests/support/ports.ts`).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/domain-primitives/time.ts` | Imports `DAY_MS` to back-date `requestedAt` for the late-receipt test. |
| `src/infrastructure/adapters/mailer.ts` | Fully mocked (`enqueueEmail`); no real mail is sent. |
| `src/infrastructure/observability/audit.ts` | Replaced with the shared port mock (not spied) to suppress audit writes during tests. |
| `src/kernel/access/tenant.ts` | Imports `DEPLOYMENT_TENANT_ID` (used in caller-context helpers). |
| `src/kernel/events.ts` | `onDomainEvent` / `resetDomainEvents` capture and verify event emission order. |
| `src/kernel/outbox.ts` | `settleOutboxNudges()` flushes pending outbox work (emails, status projections) before assertions. |
| `src/modules/access/tests/factories.ts` | `seedMembership` provides tenant/user linkage for caller contexts. |
| `src/modules/delivery/tests/factories.ts` | `carryOrderTo(orderId, 'delivered')` advances fulfillment so stock is actually decremented. |
| `src/modules/inventory/index.ts` | Re-exports `inventoryService`, which the test calls to reserve stock for the order. |
| `src/modules/inventory/services/index.ts` | Defines the `inventoryService` implementation (including `reserveForOrder`) that the test exercises. |
| `src/modules/invoicing/index.ts` | Re-exports `invoicingService` and the `CreditNoteDocument` type used in imports. |
| `src/modules/invoicing/module.ts` | `invoicingModule` is registered in `beforeEach` so its event handlers are active. |
| `src/modules/invoicing/services/index.ts` | Defines `invoicingService` and `CreditNoteDocument` that the test file imports for credit-note assertions. |
| `src/modules/orders/domain/withdrawal.ts` | `withdrawalRefundDueBy` computes the expected 14-day due date for stamp assertions. |

## Notes

- **Audit is replaced, not spied.** The mock uses `jest.requireActual('@tests/ports').auditPortMock()`, meaning the module is swapped at the module-graph level. Do not add `jest.spyOn` on audit in this file.
- **Async settling is explicit.** State that lands via the outbox (partial-refund status, domain events) is awaited with `eventually()` or `settleOutboxNudges()`. Adding a new outbox-driven side-effect without a corresponding settle call will cause flaky assertions.
- **`customers` counter** ensures globally unique buyer emails across tests in this file; do not reset it in `beforeEach`.
- **Module registration order** in `beforeEach` matters: `returnsModule` is registered last so its event listeners see the already-registered payment/invoicing handlers.
- **`mugTaxClass: 'reduced'`** param is available for VAT-rate tests but no current test exercises it; keep it if adding tax-class coverage.
