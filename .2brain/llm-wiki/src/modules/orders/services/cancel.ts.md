---
source: src/modules/orders/services/cancel.ts
source_sha256: d63da8e5c648eeb897d269fe302cab25d0ec98febbff78acb29cd2d62c980a76
context_sha256: 3c581e8c47adea002f15917220fd398d61741fdc41596b59fb45505bc8737506
generated_at: 2026-11-22T06:19:21.133115+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/cancel.ts

## Purpose
Cancels an order and makes the consequences stick. The status move, the release of the stock hold (or a paid order's committed claim), and the `order.canceled` outbox row happen in one transaction, so a failed release rolls the status back too. The refund is not in the transaction, because money at a provider cannot roll back. The intent is recorded as `refund` on the `order.canceled` event, and `payments` opens the refund record from it while the outbox relay retries.

## Key elements
- `CancelCause` is a type alias of `OrderCancelCause` from `@types`. It is the contract value of `order.canceled`'s `cause`.
- `CANCEL_CAUSES` is the single rules table, declared `as const satisfies Record<CancelCause, CauseRules>`. Its causes are `customer`, `operator`, `withdrawal`, `reservation_expired`, `erasure`, `payment_mismatch` and `lost`. Each row sets:
  - `by`: the lifecycle column and who the timeline says did it.
  - `mail`: `canceled`, `reservation-expiry` or `none`.
  - `analytics`: the analytics event name.
  - `refundIsChoice`: whether the caller decides on the refund. This is true only for `operator`.
- `afterCancel(order, cause, refund, context?)` runs the post-commit side effects. It records an audit row and emits an analytics event. A missing context falls back to `systemCallerContext('Order')`. It returns `generateSuccess(order, 200)`.
- `moveToCanceled` (internal) is the atomic step.
  - It does a conditional `orderRepository.updateStatusIfIn(...)` to `canceled`, wrapped in `withTimeline`, which adds a `canceled` timeline entry.
  - If the move landed, it calls `giveBackStock`.
  - It announces `ORDER_CANCELED` with `orderId`, `refund`, `cause` and an optional `informedAt`.
  - With a caller-supplied `within` session it uses `announceWithin`, and the caller commits. Otherwise it uses `announceInTransaction`, then `inventoryService.forgetAvailabilityForOrder` after the commit.
- `giveBackStock` (internal) calls `inventoryService.releaseForOrder(orderId, 'release', session)`. If that claims nothing, it calls `releaseCommittedForOrder`, which handles a paid order's committed hold. A committed hold is not restocked, since units leave at shipment.
- `attemptCancel` (internal) runs the cancel write in its own transaction or the caller's. It returns a `CancelAttempt` of `{ order, refund, scope }`. The refund is `refundChoice ?? true` when the cause's `refundIsChoice` is set, and `true` otherwise. The filter combines the caller's scope with the cause's lifecycle column, so races resolve at the storage layer. The visible part of the file ends partway through this function.

## Relationships
- **Inventory:** `@modules/inventory` provides `inventoryService`, which releases holds and clears availability entries.
- **Outbox:** `@kernel/outbox` provides `announceInTransaction` and `announceWithin`, which write the outbox announcement for the cancel.
- **Permissions:** `@kernel/permissions` provides `SYSTEM_ACTOR` and `systemCallerContext` for system-initiated cancels.
- **Access:** `@modules/access` provides `ownOrderFlag`, which goes into the audit metadata.
- **Audit and analytics:** `recordAudit` from `@infrastructure/observability/audit` and `emitAnalyticsEvent` / `buildAnalyticsBase` from `@infrastructure/observability/analytics` record the audit row and analytics event. The action and event names come from `../audit` (`ordersAuditActions`) and `../analytics` (`ordersAnalyticsEvents`).
- **HTTP responses:** `generateSuccess` and `generateReject` come from `@infrastructure/http/response`.
- **Domain:** `../domain` provides `buyerIdOf`, `statusesLeadingTo` and the `OrderActor` type.
- **i18n:** `t` is imported from `@infrastructure/i18n`.

## Notes
- The cancel is conditional on both the caller's scope and the lifecycle column. A racing admin "shipped" or a double-click therefore matches exactly one write.
- A customer cancel is always refunded. Only an operator may cancel without a refund.
- `lost` is written by `markUndeliverable`, not by `cancel()`. It carries `refund: false` because the remainder cancel already refunded.
- `withdrawal` has no mail from this module, since `returns` sends its own acknowledgement. `erasure` has no mail either, because there is nobody to tell.
- Adding a cause to the contract fails the `satisfies` check until `CANCEL_CAUSES` has a row for it.
- A hold that has already expired is an ordinary case, because the units are already back.
- With `within`, the caller must commit, nudge the relay and clear the availability entries (see `withdrawWithin`).
