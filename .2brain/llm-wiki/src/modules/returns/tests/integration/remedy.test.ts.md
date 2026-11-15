---
source: src/modules/returns/tests/integration/remedy.test.ts
sha256: 72fbe5a7b84cc9e9029ce76d5faa3718dc5eeb3e62556e8d820fa4425340ef27
generated_at: 2026-11-14T21:46:24.538284+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/remedy.test.ts

## Purpose

Integration tests for the remedy ladder on a return (replacement or repair) per Directive 2019/771 Art. 13. Verifies that a replacement reopens the same fulfillment order and ships through the normal delivery path without moving money, that a repair extends the conformity deadline by 12 months (once only), that a withdrawal always ends in a refund with no remedy choice, and that edge cases (short stock, insufficient shipped quantity) behave correctly. Runs against a real database with the `fake` payment provider.

## Key elements

- **`approvedReturn(reason, onHand, preferredRemedy?)`** — end-to-end helper that creates a user, product, order, payment intent, delivery, and an approved (or auto-approved withdrawal) return of two units. Returns the IDs needed for subsequent assertions.
- **`broken(opened)`** — shorthand for `{ lines: [{ productId, restock: 0 }] }`; models a faulty item that is not re-shelfable.
- **`refundedOf(orderId)`** / **`statusOf(orderId)`** / **`statusOfReturn(id)`** — small assertion helpers that read persisted state (payment refund total, order status, return status) from the database.
- **`describe('asking for a remedy')`** — confirms `preferredRemedy` is stored as a wish on a defect and is rejected with `RETURN_REMEDY_INVALID` on a withdrawal.
- **`describe('receiving with a replacement')`** — five tests: zero refund + order reopens at `processing`; shipment through the delivery service keeps the withdrawal clock and updates stock; replaced units remain returnable; backorder creates a second `on_hold` fulfillment order; 409 `DELIVERY_NOT_REOPENABLE` when shipped quantity is insufficient (nothing written).
- **`describe('receiving with a repair')`** — zero refund, guarantee extended by exactly 12 months, order stays `delivered`; second repair does **not** extend the deadline a second time.

## Relationships

- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` is called after `createReturn` to flush any queued outbox side-effects before assertions.
- **`src/kernel/events.ts`** — `resetDomainEvents()` in `afterEach` clears the event bus between tests.
- **`src/modules/delivery/index.ts`** — exports `deliveryService`, used to ship the reopened fulfillment order after a replacement.
- **`src/modules/delivery/services/index.ts`** — provides the delivery service implementation exercised during the ship-and-deliver assertions.
- **`src/modules/delivery/tests/factories.ts`** — `carryOrderTo`, `deliverEverything`, `fulfillmentOrdersOf`, `setFirstLineShipped` drive order and fulfillment state for setup and inspection.
- **`src/modules/inventory/index.ts`** — exports `inventoryService`, used to reserve stock before payment in the setup helper.
- **`src/modules/inventory/services/index.ts`** — provides the inventory service implementation for the reservation call.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `readOrder`, `toOrderItem` build and inspect the order aggregate.
- **`src/modules/payments/index.ts`** — exports `paymentService` for creating the intent, confirming payment, and reading `amountRefunded`.
- **`src/modules/payments/module.ts`** — `paymentsModule` is passed to `registerCheckoutModules` so the returns service can resolve payment context.
- **`src/modules/payments/services/index.ts`** — provides the payment service implementation used by `paymentService`.
- **`src/modules/products/tests/factories.ts`** — `createProduct` and `countersOf` set up inventory and assert `onHand`/`reserved` counts.
- **`src/modules/returns/module.ts`** — `returnsModule` registered in `registerCheckoutModules` for the module graph.
- **`src/modules/returns/services/index.ts`** — exports `returnService`, the API under test (`createReturn`, `approveReturn`, `receiveReturn`).
- **`src/modules/returns/repository.ts`** — exports `returnRepository`, used to read persisted return state for direct assertions (e.g. `preferredRemedy`, status after a 409).

## Notes

- Tests run against a **real database** (`setupTestDb()`); there are no service mocks. The only fake is the payment provider (`fake` via `testCallerContext`).
- The `customers` module-level counter guarantees unique email addresses across tests within the file.
- `broken()` always passes `restock: 0`; the "repair" tests pass no `lines` at all because no units are physically restocked.
- The file is truncated in this snapshot; the repair "once per order" test is cut off mid-call, but the intent is clear from the preceding assertion.
- Conventions: staff actions use the shared `admin` caller context; customer actions use `asCustomer(user.id)` paired with `callerContextAs('customer', user.id)`.
