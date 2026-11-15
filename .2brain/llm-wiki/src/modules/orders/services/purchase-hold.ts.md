---
source: src/modules/orders/services/purchase-hold.ts
sha256: 03e1a8d8ff43fc90aa4bfaf5ee709f56c7a52f4e5cd018ced50000e8bbcc412a
generated_at: 2026-11-14T20:45:28.656184+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/purchase-hold.ts

## Purpose

Reacts to `order.canceled` domain events to enforce an automated purchase-hold rule. It counts a buyer's cancellations within a configurable window and either pauses their next checkout (unpaid cancels from `customer`, `withdrawal`, or `reservation_expired` causes) or flags the account for staff review (paid cancels only). The goal is to catch bot or loop behavior while leaving legitimate statutory withdrawals unblocked.

## Key elements

- **`COUNTED_CAUSES`** — `ReadonlySet<string>` of the only cancellation causes that feed the counter (`customer`, `withdrawal`, `reservation_expired`). All other causes (staff, erasure, payment mismatch) are excluded.
- **`Findings`** (interface) — Internal result shape: `pauseUntil` (Date | undefined) and `review` (boolean).
- **`findingsFor(userId, now)`** — Queries `userService.purchaseHoldCountingSince` and `orderRepository.findCanceledIdsOf`, then `orderEventRepository.findBuyerCancelTimes` for both paid and unpaid sets. Passes results through the pure `purchaseHoldUntil` to compute `pauseUntil` and `review`.
- **`actOn(userId, findings)`** — If `pauseUntil` is set, calls `takeAutomaticPurchaseHold` and emits `ORDER_PURCHASE_HOLD_PLACED`. Otherwise, if `review` is true, calls `userService.flagPurchaseHoldReview`. No-op if neither condition holds.
- **`considerPurchaseHold(payload)`** — **Exported** entry point. Filters on `COUNTED_CAUSES`, loads the order to resolve `userId`, then chains `findingsFor` → `actOn`. Catches all errors and logs them without rethrowing.

## Relationships

- **src/modules/orders/domain/index.ts** — Barrel import for `purchaseHoldUntil`, the pure threshold-and-date function.
- **src/modules/orders/domain/purchase-hold.ts** — Defines `purchaseHoldUntil`, re-exported through the domain barrel above.
- **src/modules/orders/config.ts** — Supplies `purchaseHoldCancelCount()` and `purchaseHoldWindowDays()` (the threshold and window).
- **src/modules/orders/repository.ts** — `orderRepository.findById` resolves the buyer; `orderEventRepository.findBuyerCancelTimes` retrieves timestamped cancel events for the counted order IDs.
- **src/modules/orders/events.ts** — Exports `ORDER_PURCHASE_HOLD_PLACED`, emitted after a successful hold.
- **src/modules/orders/services/index.ts** — Re-exports `considerPurchaseHold` for subscribers.
- **src/modules/users/index.ts** — Barrel that provides `userService` (which carries `purchaseHoldCountingSince` and `flagPurchaseHoldReview`).
- **src/modules/users/services/purchase-hold.ts** — Owns the hold state and review flag; this file calls `purchaseHoldCountingSince` (reset anchor) and `flagPurchaseHoldReview`.
- **src/modules/users/services/index.ts** — Barrel through which the user-service methods are exposed.
- **src/modules/users/friends/orders.ts** — `takeAutomaticPurchaseHold` performs the actual pause write.
- **src/kernel/events.ts** — `emitDomainEvent` and the `DomainEventMap['order.canceled']` payload type.
- **src/kernel/permissions.ts** — `systemCallerContext('User')` supplies the caller identity for service calls.
- **src/kernel/access/tenant.ts** — `DEPLOYMENT_TENANT_ID` stamped on the emitted event.
- **src/infrastructure/adapters/logger.ts** — Logs the caught error so the failure is visible without propagating.

## Notes

- **Errors are swallowed (logged, not thrown).** The count is derived state, not a monotonic counter, so the next `order.canceled` event for the same buyer will recompute identically and act then. Throwing here would block downstream event processing (e.g., refund email).
- **At-least-once delivery is safe.** A hold that is already taken resets the counting anchor to its own `setAt`, and `flagPurchaseHoldReview` is idempotent — a redelivered event is a no-op.
- **Paid cancels never pause.** Pre-dispatch cancellation is a statutory withdrawal; it only sets the review flag so a human can inspect the account.
- **Orders with no buyer (erased account) are skipped silently** after the `findById` lookup returns a null/undefined `userId`.
