---
source: src/modules/returns/tests/integration/proof-of-sending.test.ts
sha256: 1af3463ab0aa25613e13b6182200f7307d74b6ae514c658c07968953e090d80e
generated_at: 2026-11-14T21:45:04.163094+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/proof-of-sending.test.ts

## Purpose

Integration test for the buyer's proof-of-sending workflow, run against a real database and the fake payment provider. Verifies three invariants: on a withdrawal the refund opens immediately and once; on a defective item the proof only records; and goods arriving after a proof neither open a second refund nor permit a handling deduction.

## Key elements

- **`proofOn(sentAt)`** – builds the carrier-document object (`sentAt`, `carrier`, `reference`) as staff would submit it.
- **`approvedReturn(reason)`** – fixture that creates a paid, delivered two-shirt order, an inventory reservation, a confirmed payment, and an approved return for either `'withdrawal'` or `'defective'`.
- **`buyers`** – module-level counter ensuring unique buyer emails per fixture.
- **`describe('a proof of sending on a withdrawal')`** – covers refund due-date (14-day shop-timezone rule), document persistence, idempotency (second call → 409 `RETURN_PROOF_ALREADY_RECORDED`), action toggling (`recordProof` off, `cancel` off only when refund opened), state guard (`RETURN_NOT_RECEIVABLE`), late-proof date, future-date rejection (422 `RETURN_PROOF_DATE_INVALID`), and cancel refusal (`RETURN_REFUND_OPEN`).
- **`describe('the goods arriving after a proof on a withdrawal')`** – covers restock without a second refund, handling-deduction refusal (409 `RETURN_REFUND_OPENED_ON_PROOF`), and the sweep closing the return once the refund settles (using a mocked provider failure + `NODE_PAYMENT_REFUND_RETRY_MINUTES: 0`).

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** – `fakePaymentProvider` is spied on (`mockRejectedValueOnce`) to simulate a refund failure in the sweep test.
- **`src/kernel/events.ts`** – `resetDomainEvents` called in `afterEach`.
- **`src/modules/orders/index.ts`** – `withdrawalRefundDueBy` imported for expected due-date assertions.
- **`src/modules/orders/domain/withdrawal.ts`** – source of the `withdrawalRefundDueBy` domain rule.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem`, `timelineOf` for order fixtures and event-timeline assertions.
- **`src/modules/delivery/tests/factories.ts`** – `carryOrderTo(orderId, 'delivered')` advances the order state.
- **`src/modules/inventory/index.ts`** – provides `inventoryService` for the reservation step in the fixture.
- **`src/modules/payments/index.ts`** – provides `paymentService` for intent creation and confirmation in the fixture.
- **`src/modules/payments/module.ts`** – registered alongside `returnsModule` in `beforeEach`.
- **`src/modules/payments/tests/factories.ts`** – `storedRefundStamps(orderId)` verifies refund records in the DB.
- **`src/modules/products/tests/factories.ts`** – `createProduct`, `countersOf` for product fixtures and inventory assertions.
- **`src/modules/returns/model.ts`** – `returnModel` imported for a direct `updateOne` to backdate `requestedAt` in the late-proof test.
- **`src/modules/returns/module.ts`** – `returnsModule` registered in `beforeEach` via `registerCheckoutModules`.

## Notes

- Runs against a **real database** (`setupTestDb()` at module scope); only the payment provider is faked.
- One test reaches into the model layer directly (`returnModel.updateOne`) to backdate `requestedAt` — this bypasses the service layer and is safe only because the test controls the only writer.
- The sweep test relies on `withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' })` to force an immediate retry window.
- `beforeEach` registers **both** the payments and returns modules; tests depend on both being active in the same request pipeline.
