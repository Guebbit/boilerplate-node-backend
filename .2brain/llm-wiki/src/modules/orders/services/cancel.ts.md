---
source: src/modules/orders/services/cancel.ts
sha256: c0d7f16e4ca5c2ab56f17d39cd2cc7f3ab0b0a205790d37311055f20fffe684d
generated_at: 2026-11-08T06:56:27.942048+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/cancel.ts

## Purpose

Atomic order cancellation: the status move, stock release, and `order.canceled` outbox event are committed in a single transaction so a failed release rolls back the status too. The refund is deliberately *outside* the transaction (it is a provider-side operation that cannot roll back); instead a `refund` flag rides on the outbox event, which the `payments` module later acts on. The file also owns the cause taxonomy that drives mail, analytics, lifecycle column, and refund rules.

## Key elements

- **`CancelCause`** (exported type) — seven-literal union: `customer`, `operator`, `withdrawal`, `reservation_expired`, `erasure`, `payment_mismatch`, `lost`.
- **`CauseRules`** (interface) — per-cause decisions: lifecycle column (`by`), mail kind, analytics event, and whether refund is caller-selectable (`refundIsChoice`).
- **`CANCEL_CAUSES`** (exported const) — the single table mapping each `CancelCause` to its `CauseRules`. Adding a cause means adding a row here.
- **`giveBackStock(orderId, session)`** (private) — releases a `held` reservation via `inventoryService.releaseForOrder`; if none matched, releases a `committed` one via `inventoryService.releaseCommittedForOrder`. Runs inside the cancel's transaction.
- **`moveToCanceled(id, from, scope, refund, cause, actorId)`** (private) — the one atomic step: conditional `updateStatusIfIn`, timeline write, stock release, and outbox row via `announceInTransaction`. After commit, refreshes the inventory stock cache (a write that cannot roll back).
- **`afterCancel(order, cause, refund, context?)`** (exported) — post-commit side effects only: records the audit row (`recordAudit`) and emits the analytics event (`emitAnalyticsEvent`), then returns a 200 `generateSuccess` response.
- **`cancel(id, cause, authContext, refundChoice?, context?, onBuyersBehalf?)`** (private) — the orchestrator every "door" calls. Resolves the refund boolean, computes the write scope via `cancelScope`, reads permitted `from` statuses from the lifecycle table (`statusesLeadingTo`), and delegates to `moveToCanceled`. Not exported; callers state intent by picking a cause.

## Relationships

- **`src/kernel/permissions.ts`** — imports `SYSTEM_ACTOR` and `systemCallerContext` to build a caller context for system-initiated cancels (audit + analytics).
- **`src/kernel/outbox.ts`** — imports `announceInTransaction`, the wrapper that commits the status write and the `ORDER_CANCELED` event atomically.
- **`src/modules/inventory/index.ts`** — imports `inventoryService`; calls `releaseForOrder`, `releaseCommittedForOrder`, and `refreshStockCacheForOrder`.
- **`src/modules/inventory/services/index.ts`** — the concrete service behind `inventoryService`; provides the transactional release and post-commit cache refresh.
- **`src/modules/orders/domain/index.ts`** — imports `buyerIdOf`, `statusesLeadingTo`, and the `OrderActor` type; the lifecycle table drives which `from` statuses are valid per cause.
- **`src/modules/orders/domain/lifecycle.ts`** — the table that `statusesLeadingTo` reads (re-exported through the domain index).
- **`src/modules/orders/analytics.ts`** — imports `ordersAnalyticsEvents` for the per-cause analytics event name.
- **`src/modules/orders/audit.ts`** — imports `ordersAuditActions` for the audit action string.
- **`src/infrastructure/http/response.ts`** — imports `generateReject`, `generateSuccess`, and the response types to build the HTTP result.
- **`src/infrastructure/i18n/index.ts`** — imports `t` for localized error messages.
- **`src/infrastructure/observability/analytics/index.ts`** — imports `emitAnalyticsEvent` and `buildAnalyticsBase` for the post-commit analytics call.
- **`src/infrastructure/observability/audit.ts`** — imports `recordAudit` for the post-commit audit row.
- **`src/modules/access/index.ts`** — imports `ownOrderFlag` to annotate the audit metadata with whether the caller owned the order.

## Notes

- **Refund is a promise, not a fact.** The `refund` boolean is written on the outbox event payload; the actual money movement happens later in `payments`. A `paid` order's hold is `committed`, not `held`, so `releaseForOrder` will not match it — `giveBackStock` falls through to `releaseCommittedForOrder`.
- **Conditional write, not read-then-write.** The status move uses `updateStatusIfIn` with the caller's scope and `fulfillment.shipped: { $ne: true }` in the same filter. A racing shipment or double-click resolves at the storage layer; the follow-up read on `null` only distinguishes 404 from 409.
- **`lost` bypasses `cancel()`.** It is written by `markUndeliverable` and carries `refund: false` because the returns transaction already refunded.
- **`refundIsChoice` is `true` only for `operator`.** A customer canceling a `paid` order always refunds; the system causes refund whatever was paid. The `refundChoice` parameter is ignored by every other cause.
- **Stock cache refresh is post-commit.** `refreshStockCacheForOrder` runs after the transaction commits because that cache write is not part of the MongoDB session and cannot roll back.
- **The module has no default export** (`@module` directive). All public surface is the named exports listed above plus the types.
