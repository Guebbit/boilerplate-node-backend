---
source: src/modules/returns/tests/integration/remedy.test.ts
sha256: fefa98d932ba1d16ce93d8325adb550b935ac94a3e5d5121f667d081aeb641c9
generated_at: 2026-11-08T08:09:52.781090+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/remedy.test.ts

## Purpose

Integration tests for the remedy ladder (Directive 2019/771 Art. 13) applied to a returned defective or wrong item: staff choose **replace** (reopen the same order, ship again) or **repair** (extend the guarantee by 12 months, once). Confirms that neither remedy moves money, that replaced units stay returnable, and that a withdrawal return can never carry a preferred remedy. Runs against a real database with the fake payment provider.

## Key elements

- **`approvedReturn(reason, onHand, preferredRemedy?)`** – full-lifecycle fixture: creates user → product → order → inventory reservation → payment intent + confirmation → delivers → creates (and for non-withdrawal, approves) a return. Returns `{ user, shirt, orderId, id }`.
- **`broken(opened)`** – shorthand for `lines: [{ productId, restock: 0 }]`, meaning the received units are not resellable.
- **`statusOf` / `statusOfReturn` / `refundedOf`** – small read helpers hitting the order, return repository, and payment service respectively.
- **`describe('asking for a remedy')`** – verifies `preferredRemedy` is persisted on a defect return; verifies `RETURN_REMEDY_INVALID` is raised when a withdrawal return is submitted with one.
- **`describe('receiving with a replacement')`** – asserts the original fulfillment order reopens (no new one), order returns to `processing`, inventory is re-reserved, shipping through the ordinary `deliveryService` works, the withdrawal clock is untouched, replaced units remain returnable, a backorder fulfillment order is created when stock is insufficient, and a 409 `DELIVERY_NOT_REOPENABLE` is returned (with no writes) when the shipped quantity is less than the return quantity.
- **`describe('receiving with a repair')`** – asserts refund amount is 0, `conformityUntil` moves forward by exactly 12 months, the order stays `delivered`, and a second repair does **not** extend the guarantee again.

## Relationships

- **`src/kernel/outbox.ts`** – `settleOutboxNudges()` flushes outbox-published events after `approvedReturn` so downstream handlers have run before assertions.
- **`src/kernel/events.ts`** – `resetDomainEvents()` in `afterEach` clears in-memory event bus between tests.
- **`src/modules/returns/module.ts`** / **`src/modules/payments/module.ts`** – registered via `registerCheckoutModules` in `beforeEach` to wire the services into the test DI container.
- **`src/modules/returns/services/index.ts`** – `returnService` is the system under test (`createReturn`, `approveReturn`, `receiveReturn`, `cr…`).
- **`src/modules/returns/repository.ts`** – `returnRepository.findById` used to assert stored `preferredRemedy`, `remedy`, and `status` directly.
- **`src/modules/delivery/index.ts`** – `deliveryService.shipFulfillmentOrder` ships the reopened fulfillment order in the replacement tests.
- **`src/modules/delivery/tests/factories.ts`** – `carryOrderTo`, `deliverEverything`, `fulfillmentOrdersOf`, `setFirstLineShipped` drive order/delivery state.
- **`src/modules/inventory/index.ts`** – `inventoryService.reserveForOrder` sets up initial reservations before payment.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `readOrder`, `toOrderItem` build and inspect order state.
- **`src/modules/products/tests/factories.ts`** – `createProduct`, `countersOf` manage shelf stock and assert `onHand`/`reserved` counts.
- **`src/modules/payments/index.ts`** – `paymentService` creates/confirms the intent and reads `amountRefunded`.

## Notes

- Uses a **real database** (`setupTestDb`) and the **fake** payment provider; no mocks on services.
- The `customers` module-level counter guarantees unique e-mails across tests; there is no per-test isolation of that counter.
- The `admin` caller context is a module-level constant (`callerContextAs('admin')`); all staff actions use it.
- The 409 test (`DELIVERY_NOT_REOPENABLE`) verifies **no** side-effect writes occur on rejection—inventory counters and return status are checked to be unchanged.
- The file is truncated in the source snapshot; the `describe('receiving with a repair')` block continues past what is shown (at least a second-repair test).
