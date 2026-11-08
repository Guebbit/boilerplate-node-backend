---
source: src/modules/orders/services/purchase-hold.ts
sha256: 6374e4e653bd8dbfa2834d7995ed3e85408a27d08a4c6da9964849ab070de40f
generated_at: 2026-11-08T06:59:20.258373+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/purchase-hold.ts

## Purpose

Implements the purchase-hold rule triggered by the `order.canceled` domain event. It counts a buyer's recent cancellations within a sliding window and, if a threshold is met, either pauses the buyer's next checkout (unpaid cancellations) or flags the account for staff review (paid cancellations). The rule is reactive and at-least-once safe: it never blocks the original cancel flow.

## Key elements

- **`considerPurchaseHold`** (exported) — Entry point wired to the `order.canceled` event. Filters by `COUNTED_CAUSES`, resolves the buyer, runs `findingsFor`, then `actOn`. All failures are logged and swallowed so downstream events (e.g. refund mail) are never held back.
- **`COUNTED_CAUSES`** — Read-only set of cancellation causes that increment the counter: `'customer'`, `'withdrawal'`, `'reservation_expired'`. Staff actions, erasures, and payment mismatches are excluded.
- **`Findings`** — Internal result shape: `pauseUntil` (a `Date` when the hold would end, or `undefined`) and `review` (boolean for the paid-cancellation flag).
- **`findingsFor`** — Queries `userService.purchaseHoldCountingSince` for the counting anchor, fetches canceled order IDs from `orderRepository`, then uses `orderEventRepository.findBuyerCancelTimes` to pull cancel timestamps for both paid and unpaid sets. Applies the `purchaseHoldUntil` domain function with the configured limit and window.
- **`actOn`** — If `pauseUntil` is set, calls `userService.takeAutomaticPurchaseHold` and, on success, emits `ORDER_PURCHASE_HOLD_PLACED`. If only `review` is set, calls `userService.flagPurchaseHoldReview`. Both use `systemCallerContext('User')` as the caller identity.

## Relationships

- **`src/modules/orders/config.ts`** — Supplies `purchaseHoldCancelCount()` and `purchaseHoldWindowDays()` (the two tunables).
- **`src/modules/orders/domain/index.ts`** → **`src/modules/orders/domain/purchase-hold.ts`** — Provides `purchaseHoldUntil`, the pure function that maps a list of cancel timestamps + limit + window → hold end date.
- **`src/modules/orders/repository.ts`** — `orderRepository.findById` (resolve buyer) and `orderEventRepository.findBuyerCancelTimes` (fetch cancel timestamps per paid/unpaid split).
- **`src/modules/orders/events.ts`** — `ORDER_PURCHASE_HOLD_PLACED` event name emitted when a hold is taken.
- **`src/kernel/events.ts`** — `emitDomainEvent` and the `DomainEventMap` type used in the function signature.
- **`src/kernel/permissions.ts`** — `systemCallerContext` to construct the caller identity for users-service calls.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` stamped onto the emitted event.
- **`src/infrastructure/adapters/logger.ts`** — Error logging on failure.
- **`src/modules/users/index.ts`** — `userService` provides `purchaseHoldCountingSince`, `takeAutomaticPurchaseHold`, and `flagPurchaseHoldReview`.
- **`src/modules/orders/services/index.ts`** — Re-exports `considerPurchaseHold` to the rest of the codebase.

## Notes

- **Paid vs. unpaid distinction is load-bearing.** Unpaid cancellations (customer cancel, withdrawal, reservation expiry) can trigger a *pause*. Paid cancellations can only trigger a *review flag*. This mirrors the legal split between statutory withdrawal and genuine cancellation.
- **Failures are intentionally non-fatal.** The `.catch` in `considerPurchaseHold` logs and resolves; the rationale (in the docblock) is that a rejection would block the order's subsequent events, whereas the next cancel will simply re-evaluate the same state.
- **Idempotency by design.** A redelivered event that attempts a second hold or flag is a no-op because `takeAutomaticPurchaseHold` restarts the counting anchor and `flagPurchaseHoldReview` is idempotent. No dedup key is needed.
- **No buyer → no-op.** If the order's `userId` is null (erased account), the function resolves without action.
