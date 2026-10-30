---
source: src/modules/orders/services/cancel.ts
sha256: c23663f6d96591d3ec7887648211e82a53f27f2e0886352fcabb934a6c0dc3ba
generated_at: 2026-10-29T04:45:59.226392+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/cancel.ts

## Purpose

Implements the single atomic order-cancellation path: the status transition, the inventory hold release (or committed-hold release for paid orders), and the `order.cancelled` outbox row all commit in one database transaction. Refunds are intentionally excluded from the transaction (they are irreversible provider-side calls) and are instead carried as a `refund` flag on the outbox event, which the `payments` module and the outbox relay act on asynchronously.

## Key elements

- **`cancel(id, cause, authContext, refundChoice?, context?, onBuyersBehalf?)`** — Private (non-exported) orchestrator. Resolves the cause's rules, computes the write scope, determines allowed source statuses from the lifecycle table, and delegates to `moveToCancelled`. All public "doors" (customer self-cancel, operator cancel, withdrawal, expiry, erasure, etc.) call this function.
- **`CancelCause`** (exported type) — Union of the seven reasons an order can be cancelled: `customer`, `operator`, `withdrawal`, `reservation_expired`, `erasure`, `payment_mismatch`, `lost`.
- **`CANCEL_CAUSES`** (exported const) — Lookup table mapping each cause to its `CauseRules`: which lifecycle column it writes from (`by`), which mail template to send, which analytics event to emit, and whether the caller may opt out of the refund (`refundIsChoice`).
- **`moveToCancelled(...)`** — Performs the conditional status write (`updateStatusIfIn`), appends the timeline entry, releases stock, and enqueues the `ORDER_CANCELLED` outbox event — all inside `announceInTransaction`. After commit, refreshes the inventory stock cache.
- **`giveBackStock(orderId, session)`** — Releases a `held` reservation or (for paid orders) a `committed` reservation. Neither operation restocks; units return to the available pool.
- **`afterCancel(order, cause, refund, context?)`** — Post-commit side-effects: records the audit row (`ORDER_CANCELLED` action) and emits the analytics event. Returns the `200` success response.
- **`CauseRules`** (private interface) — Shape of each row in `CANCEL_CAUSES`: `by`, `mail`, `analytics`, `refundIsChoice`.

## Relationships

- **`@kernel/outbox` (`announceInTransaction`)** — Wraps the status write + stock release + outbox enqueue in a single MongoDB transaction; the `ORDER_CANCELLED` event is the outbox payload.
- **`@kernel/permissions` (`SYSTEM_ACTOR`, `systemCallerContext`)** — Provides the actor identity for system-initiated causes (`reservation_expired`, `erasure`, `payment_mismatch`, `lost`) so audit and analytics still record a caller.
- **`@modules/inventory` (`inventoryService`)** — `releaseForOrder` and `releaseCommittedForOrder` return stock claims inside the cancel transaction; `refreshStockCacheForOrder` runs after commit.
- **`../domain` (`buyerIdOf`, `statusesLeadingTo`)** — `statusesLeadingTo(OrderStatus.cancelled, actor)` yields the allowed source statuses per actor column; `buyerIdOf` resolves the buyer for the `ownOrderFlag` audit metadata.
- **`../analytics` / `../audit`** — Supply the event-name and action-name constants consumed by `afterCancel`.
- **`@modules/access` (`ownOrderFlag`)** — Tags the audit row with whether the actor is the order's own buyer.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape the HTTP-level response returned to the caller.
- **`@infrastructure/i18n` (`t`)** — Available for user-facing strings (e.g., error messages in the reject path).
- **`@infrastructure/observability/analytics` / `audit`** — `emitAnalyticsEvent`, `buildAnalyticsBase`, `recordAudit` are called post-commit in `afterCancel`.
- **`./scope` (`cancelScope`, `actorOf`)** — Derives the write-scope filter (buyer's own orders vs. operator's) and the actor label for the timeline.
- **`./timeline` (`withTimeline`)** — Wraps the repository write so a timeline entry is appended atomically.
- **`./read` (`getById`)** — Used in the follow-up read after a `null` result to distinguish 404 from 409.

## Notes

- **`cancel` is intentionally private.** Callers select a cause through a dedicated public door; no external code can pick a cause on another caller's behalf.
- **The `lost` cause is never passed through `cancel()`.** It is written by `markUndeliverable` (fulfillment) and carries `refund: false` because the remainder was already refunded at cancel time.
- **Refund is a promise, not an action.** The transaction only records `refund: true|false` on the outbox event. The actual money movement is handled downstream by the `payments` module retrying from that event.
- **Conditional write, not read-check-write.** The status filter and `fulfillment.shipped: { $ne: true }` guard live inside the same `update` query, so a racing shipment and a racing cancel resolve atomically at the storage layer — exactly one wins.
- **Post-commit work (audit, analytics, stock-cache refresh) is non-transactional.** These run after the `then()` chain; a failure here does not roll back the cancel.
- **`refundIsChoice` is only meaningful for `operator`.** Every other cause either always refunds (`customer`, `withdrawal`, `erasure`, `payment_mismatch`) or always does not (`lost`).
