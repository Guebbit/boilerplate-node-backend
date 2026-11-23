---
source: src/modules/returns/tests/integration/remedy.test.ts
source_sha256: eeeec29d64ca663b44b69ac3c0bfedbed6d583b4acbd064ffdbbc29bd09d1404
context_sha256: 13599aa6eee05249359e5fb1a556ff6eea3192599016c47088d270cc9733ceeb
generated_at: 2026-11-22T07:36:32.077097+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/integration/remedy.test.ts

## Purpose
Integration tests for the remedy ladder on faulty or wrong items (Directive 2019/771 Art. 13). Staff can give a replacement or a repair instead of a refund. A replacement reopens the returned units on the same order and ships them again through the normal delivery flow. A repair extends the guarantee by 12 months, once. Neither moves money, and the units stay returnable afterwards. A withdrawal always gets a refund and has no remedy choice. Tests run against a real database and the real `fake` payment provider.

## Key elements
- `setupTestDb()`, `beforeEach` (registers `paymentsModule` and `returnsModule` via `registerCheckoutModules`), and `afterEach` (`resetDomainEvents`) set up each test.
- `approvedReturn(reason, onHand, preferredRemedy?)` is the main arranging helper. It does the following:
  - creates a user and a 30.00 shirt product;
  - creates an order for 2 shirts and reserves stock;
  - pays by card (`pm_card_visa`) and carries the order to `delivered`;
  - creates a return and, unless the reason is `withdrawal`, approves it;
  - calls `settleOutboxNudges()`.
  - It returns `{ user, shirt, orderId, id }`, typed as `Opened`.
- `broken(opened)` builds receive lines with `restock: 0`, because a broken pair is not sellable.
- `statusOf`, `statusOfReturn` and `refundedOf` read the stored order status, return status and refunded amount.
- `describe('asking for a remedy')` checks that:
  - a preferred remedy on a defect is stored as `preferredRemedy`, with `remedy` left unset;
  - a preferred remedy on a withdrawal is rejected with `RETURN_REMEDY_INVALID` on the field `preferredRemedy`.
- `describe('receiving with a replacement')` checks that:
  - the return closes at 0 refund, no money moves, and the order goes back to `processing`;
  - the same fulfillment order is reopened, with no new one created;
  - the shelf counters change to `onHand` 8 and `reserved` 2;
  - the replacement ships, and `withdrawUntil` is unchanged after delivery;
  - `conformityUntil` never moves earlier;
  - the replaced units can be returned again as `defective`;
  - when stock is short, an `on_hold` backorder fulfillment order is created for the shortfall;
  - when the order shipped fewer units than are being replaced, the call fails with `DELIVERY_NOT_REOPENABLE` and writes nothing. The return stays `approved`.
- `describe('receiving with a repair')` checks that:
  - the return closes at 0 refund and no money moves;
  - `conformityUntil` moves out by one year;
  - the order stays `delivered`;
  - the extension happens only once per order, however many repairs follow.
- The visible part of the file ends partway through the repair tests.

## Relationships
- `@kernel/outbox` (`settleOutboxNudges`) and `@kernel/events` (`resetDomainEvents`) flush async side effects after arranging and reset event state between tests.
- `returns/module` and `returns/services` are the code under test, via `returnService` (`createReturn`, `approveReturn`, `receiveReturn`). `returns/repository` (`returnRepository`) is used to read the stored return.
- `payments` (`paymentService`, `paymentsModule`) creates and confirms the card payment and reads `amountRefunded`.
- `inventory` (`inventoryService`) reserves stock before the sale.
- `delivery` (`deliveryService`) ships the replacement. `delivery/tests/factories` supplies `carryOrderTo`, `deliverEverything`, `fulfillmentOrdersOf` and `setFirstLineShipped`.
- `orders/tests/factories` supplies `createOrder`, `readOrder`, `toOrderItem` and `timelineOf`. `products/tests/factories` supplies `createProduct` and `countersOf`.
- Shared `@tests/*` helpers supply the DB setup, module registration, caller contexts and `asReject`.

## Notes
- A module-level `customers` counter gives each helper call a distinct email address.
- The admin caller context is shared as `admin`. Customer actions use `callerContextAs('customer', user.id)`.
- Refund amounts are matched with the regex `/^0(\.0+)?$/` rather than an exact string.
- `onHand` is varied per test (10 by default, 2 for the backorder case) to control whether the shelf can cover the replacement.
