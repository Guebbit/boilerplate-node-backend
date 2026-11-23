---
source: src/modules/orders/services/purchase-hold.ts
source_sha256: e2520bb492ffbf20f9c13d783b9bbf9446153a95c093c4e38291001f0963d5e7
context_sha256: aa4f1a4162138ba9bbc07a79f754fd7512ab6dba9324726e5b3797dbdbe493e2
generated_at: 2026-11-22T06:22:22.591000+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/purchase-hold.ts

## Purpose
Implements the shop's automatic response to repeated cancellations, triggered by the `order.canceled` event. The `orders` module owns the cancellation count (from order timeline rows), while the `users` module owns the hold and the review flag. Every cancel is still processed normally. The rule only blocks the buyer's next checkout, or flags the account for review, and it notifies staff when a pause is placed.

## Key elements
- **`considerPurchaseHold({ orderId, cause })`**: the only export, and the handler for `order.canceled`.
  - It ignores any cause outside `COUNTED_CAUSES`.
  - It loads the order and returns quietly if the order has no `userId` (walk-in order or erased account).
  - Otherwise it computes findings and acts on them.
  - It catches all errors and logs them with `logger.error`, so it never rejects.
- **`COUNTED_CAUSES`**: the set `customer`, `withdrawal` and `reservation_expired`. Staff, erasure and payment-mismatch cancels are excluded.
- **`Findings`**: an internal shape with `pauseUntil` (a `Date` or `undefined`) and `review` (a boolean).
- **`findingsFor(userId, now)`**: reads the user's `purchaseHoldCountingSince`, then splits the buyer's canceled orders into paid and unpaid. It fetches buyer cancel times for each group and runs `purchaseHoldUntil` with the configured count limit and window in days.
  - Unpaid cancels reaching the limit produce `pauseUntil`.
  - Paid cancels reaching the limit set `review`.
- **`actOn(userId, findings)`**:
  - If there is a `pauseUntil`, it calls `takeAutomaticPurchaseHold` as the system caller. If the hold was actually taken, it emits `ORDER_PURCHASE_HOLD_PLACED` with `tenantId`, `userId` and `until` as an ISO string.
  - If only `review` is set, it calls `userService.flagPurchaseHoldReview`.
  - If neither is set, it does nothing.

## Relationships
- **`src/modules/orders/config.ts`**: supplies `purchaseHoldCancelCount()` and `purchaseHoldWindowDays()`.
- **`src/modules/orders/domain/index.ts`** (re-exporting `src/modules/orders/domain/purchase-hold.ts`): `purchaseHoldUntil` is the calculation of when a hold would end.
- **`src/modules/orders/repository.ts`**: `orderRepository` provides `findById` and `findCanceledIdsOf`. `orderEventRepository` provides `findBuyerCancelTimes`.
- **`src/modules/orders/events.ts`** and **`src/kernel/events.ts`**: `ORDER_PURCHASE_HOLD_PLACED` is emitted through `emitDomainEvent`. The `DomainEventMap` type describes the incoming payload.
- **`src/modules/users/index.ts`** (`userService`) and **`src/modules/users/friends/orders.ts`**: the users-side API. It provides `purchaseHoldCountingSince`, `flagPurchaseHoldReview` and `takeAutomaticPurchaseHold`. The users module also has `src/modules/users/services/purchase-hold.ts`, a neighbor in the graph that sits on the users side of this rule.
- **`src/kernel/permissions.ts`** and **`src/kernel/access/tenant.ts`**: `systemCallerContext('User')` and `DEPLOYMENT_TENANT_ID` are used for the system-initiated calls and the event payload.
- **`src/infrastructure/adapters/logger.ts`**: used to log failures.

## Notes
- **Pause vs. review:**
  - Only unpaid cancels (customer or withdrawal) and expired reservations can pause an account.
  - Paid cancels, which are statutory withdrawals before dispatch, only flag the account for review and never pause it.
  - Both counts use the same limit and window.
- **Idempotency:** At-least-once event delivery is safe. A taken hold restarts the count at its own `setAt`, and an already-set flag is left alone. The staff event is emitted only when `takeAutomaticPurchaseHold` reports the hold was taken.
- **Error handling:** Errors are swallowed on purpose. The count is derived state, so the next cancel will find the same cancels and act then. A rejection would also block the order's later events, such as the refund mail.
- The file's module doc points to the "purchase hold" section of the orders module documentation for the broader rule.
