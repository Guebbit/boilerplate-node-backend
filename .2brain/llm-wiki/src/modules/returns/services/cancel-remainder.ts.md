---
source: src/modules/returns/services/cancel-remainder.ts
generated_at: 2026-11-22T07:27:53.151455+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/cancel-remainder.ts

## Purpose
Implements cancelling what has not shipped yet: a Return of `kind: cancellation`, closed at creation. Once something has shipped, an order can no longer be canceled whole, so the remainder is canceled one fulfillment order at a time, by the buyer (as part of withdrawal) or by staff holding the refund key. The `returns` module owns this because the cancel touches delivery, inventory, money and the shipping rule.

## Key elements
- `createCancellation(input, authContext, context)` (exported) – handles `POST /returns` with `kind: cancellation` and returns a `CreateReturnOutcome`. Its body is cut off in the provided source, so its exact flow isn't documented here.
- `refuseCaller` – pre-write permission and validation checks. It returns either a refusal outcome or the validated `Statement`.
  - A buyer must name `withdrawal`, otherwise `badCancellation()`.
  - Staff need the `create:Refund` key, otherwise `forbidden`. This is checked before the statement and the window.
  - It then runs `checkStatement` and `cancelRefusalOf`, mapping `window-closed` to `windowClosed()` and `excluded` to `badLines('excluded')`.
- `cancelUnderLock` – the single `withTransaction` that does the work:
  1. Locks the order row and loads earlier Returns.
  2. Calls `deliveryService.cancelRemainder`.
  3. Computes the refund breakdown via `cancellationRefundOn`.
  4. Releases stock via `orderService.releaseStock`.
  5. Creates the Return row and enqueues the `requested` and `closed` outbox events.
  6. Opens a refund record via `paymentService.openReturnRefund` when the amount is above zero.
  
  It returns `Canceled`, `'nothing-to-cancel'` or `'not-found'`.
- `rowFor` – builds the closed Return document: `kind: 'cancellation'`, `openedBy` buyer or staff, the fulfillment order id, line snapshots (title and unit price), `returnPostagePayer()`, and the refund and shipping-refund amounts.
- `announceCanceled` – post-commit steps: `nudgeOutbox`, `recordOpened` (audit), `reportCanceled`, `inventoryService.forgetAvailability`, `syncReturnStatus`, then `refund`. It resolves to `opened(created)`.
- `refund` – sends the opened refund through `paymentService.sendOpenedRefund`. It does nothing if no refund was opened.
- `Canceled` (internal interface) – the transaction result: the created Return, the lines, the opened refund or `null`, and an optional `reportCanceled` callback.

## Relationships
- **`src/modules/delivery/index.ts`**: the file imports `deliveryService` and `ActRefusal` from the delivery module. `cancelUnderLock` calls `deliveryService.cancelRemainder` in the transaction, which marks lines canceled and recomputes the order summary. It returns `ok`, `lines`, `waitingForStock` and `reportCanceled`.
- **`src/modules/inventory/index.ts`**: the file imports `inventoryService` and calls `forgetAvailability` after commit.
- **`src/modules/orders/domain/rules.ts`**: a neighbor, but this file doesn't visibly use it directly. The file imports `isBuyer`, `orderService` and `OrderDocument` from the orders module and uses `orderService.releaseStock` inside the transaction to give stock back.
- **Payments and shop**: `paymentService.openReturnRefund` runs in the transaction and `sendOpenedRefund` after commit. `returnPostagePayer` comes from `shop`.
- **Sibling returns files**: `cancel-right` (`cancelRefusalOf`), `cancellation-refund` (`cancellationRefundOn`), `refund-due` (`refundDueFor`), `projection` (`syncReturnStatus`), `outcome` (outcome builders and enqueue/audit helpers), plus `../repository`, `../model` and `../domain`.
- **`src/infrastructure/runtime/database.ts`**: `withTransaction` wraps the cancellation.
- **`src/infrastructure/persistence/create-repository.ts`**: `toObjectId` converts the fulfillment order id.
- **`src/kernel/outbox.ts`**: `nudgeOutbox` is called after commit.
- **`src/infrastructure/http/response.ts`**: `generateReject` is imported.
- **`src/infrastructure/i18n/index.ts`**: `t` is imported.
- **`src/domain-primitives/money.ts`**: `NO_MONEY` and `toMinorUnits` check that the refund is positive.
- Several imports (`t`, `generateReject`, `ActRefusal`, `FulfillmentCancelReason` use aside) are probably used in the part of the file not shown.

## Notes
- Only the payment provider call happens after commit. The refund record is already durable, and a refusal or other error is left to the payment sweep. The Return is already closed and nothing waits on it.
- For a fulfillment order held for stock, the release uses `kind: 'backorder'`, which returns the preorder allowance rather than shelf units.
- The refund due date comes from `refundDueFor(created, {})`. The source comment says only the withdrawal's 14 days can date it, so a goodwill cancel has none.
- The buyer's acknowledgement mail is sent through the `return.requested` outbox event, not directly.
- `rowFor` uses a non-null assertion on the product lookup, on the grounds that the lines come from the order's own fulfillment orders.
