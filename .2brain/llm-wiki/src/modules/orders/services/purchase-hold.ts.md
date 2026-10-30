---
source: src/modules/orders/services/purchase-hold.ts
sha256: 0fd871f2b7ea4b74b12fa3ed32376ab3e65e355c923d8aff5b236f2952ec522d
generated_at: 2026-10-29T04:48:42.453569+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/purchase-hold.ts

## Purpose

Reacts to the `order.cancelled` domain event to enforce a repeat-cancellation rule. It counts a buyer's recent cancellations (unpaid and paid) within a configured window and either pauses their next checkout or flags the account for staff review. It exists to stop automated or loop-driven abuse while keeping legitimate statutory withdrawals (pre-dispatch) from triggering a pause.

## Key elements

- **`COUNTED_CAUSES`** — `ReadonlySet` of cancel causes that feed the count: `'customer'`, `'withdrawal'`, `'reservation_expired'`. All other causes (staff, erasure, payment mismatch) are ignored.
- **`Findings`** — internal interface: `pauseUntil: Date | undefined` (unpaid cancellations hit the limit) and `review: boolean` (paid cancellations hit the limit).
- **`findingsFor(userId, now)`** — private; queries the user-service "counting-since" timestamp and the order repository for cancelled order IDs, then fetches per-buyer cancel timestamps from the event repository. Feeds both sets of times through the `purchaseHoldUntil` domain function to produce a `Findings` object.
- **`actOn(userId, findings)`** — private; if `pauseUntil` is set, calls `userService.takeAutomaticPurchaseHold` and emits `ORDER_PURCHASE_HOLD_PLACED` on success. If only `review` is true, calls `userService.flagPurchaseHoldReview`. Both calls pass `systemCallerContext('User')`.
- **`considerPurchaseHold`** *(exported)* — entry point consuming the `order.cancelled` payload. Guards on `COUNTED_CAUSES`, resolves the order to a `userId`, chains `findingsFor` → `actOn`. Catches and logs any error; never rejects.

## Relationships

- **`src/modules/users/index.ts`** — imports `userService`; calls `purchaseHoldCountingSince`, `takeAutomaticPurchaseHold`, and `flagPurchaseHoldReview` to read/write hold state and the review flag (which lives in the users module).
- **`src/modules/orders/repository.ts`** — reads the order via `orderRepository.findById` and cancel-event timestamps via `orderEventRepository.findBuyerCancelTimes`.
- **`src/modules/orders/domain/index.ts`** → **`…/domain/purchase-hold.ts`** — calls the pure `purchaseHoldUntil` function to compute the hold end date and to test whether paid cancellations cross the limit.
- **`src/modules/orders/config.ts`** — reads `purchaseHoldCancelCount()` and `purchaseHoldWindowDays()` for the limit and window parameters.
- **`src/modules/orders/events.ts`** — imports the `ORDER_PURCHASE_HOLD_PLACED` event name for emission.
- **`src/kernel/events.ts`** — uses `emitDomainEvent` and the `DomainEventMap` type.
- **`src/kernel/access/tenant.ts`** — provides `DEPLOYMENT_TENANT_ID` for the emitted event's tenant field.
- **`src/kernel/permissions.ts`** — provides `systemCallerContext('User')` as the caller identity for user-service mutations.
- **`src/infrastructure/adapters/logger.ts`** — logs failures in the top-level `.catch`.
- **`src/modules/orders/services/index.ts`** — barrel that re-exports this module alongside other order services.

## Notes

- **Failures are swallowed.** The top-level `.catch` logs and resolves. Rationale: a rejection here would block the order's subsequent events (e.g. refund mail). The count is state, not a monotonic counter, so the next cancel will find the same cancels and act.
- **Idempotent under redelivery.** A taken hold restarts the "counting-since" clock at its own `setAt`; a flag already set is left alone. Duplicate `order.cancelled` events therefore do not double-notify staff.
- **"Two doors, one act."** `customer` (cancel button) and `withdrawal` (returns) are both buyer-initiated and both count as unpaid cancellations. `reservation_expired` is system-driven but still counts. Paid cancellations (either door) never trigger a pause—only a review flag—because pre-dispatch cancellation is a statutory withdrawal.
- **Erased accounts are skipped.** If the order's `userId` is absent, the function resolves without acting.
