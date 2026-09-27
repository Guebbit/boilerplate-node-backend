---
source: src/modules/orders/services/cancel.ts
sha256: aa3bdc237f5556d09e490beba1dd9ff375345bba4b9b1f4e2961b4de1bff867b
generated_at: 2026-09-27T15:13:14.831989+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/cancel.ts

## Purpose

Implements the order-cancellation write path and its follow-up side effects (inventory release, domain-event emission, refund tracking, audit, analytics, and customer notification). It exists as a single service so that both customer-initiated cancels and system-initiated cancels (reservation expiry, product removal) share one conditional-status-write guarantee and one ordered sequence of consequences.

## Key elements

- **`cancelById(id, authContext?, options?, context?, viaReservationExpiry?)`** — Primary export. Performs the conditional status move via `orderRepository.updateStatusIfIn`, then delegates to `afterCancel`. Distinguishes 404 (not found) from 409 (not cancellable) only after the write returns null.
- **`afterCancel(order, refund, context?, viaReservationExpiry?)`** — Internal. Runs the post-cancel sequence: inventory release → restock fallback → `ORDER_CANCELLED` event → `ORDER_REFUND_OWED` event + marker clear (if refund) → optional reservation-expiry email → audit → analytics → success response.
- **`markRefundOwed(orderId)`** — Export. Writes the `'refund'` pending-effect marker on an order whose payment settled after it was already cancelled (called by the `payments` module).
- **`clearRefundOwed(orderId)`** — Export. Removes the `'refund'` marker once the refund actually lands.
- **`retryPendingEffects()`** — Export. Batch sweep (200 per run) that re-emits `ORDER_REFUND_OWED` for every order still carrying the marker, clearing each marker only after the send returns. Driven by `scripts/ops/sweep-order-effects.ts`; no in-app scheduler.
- **`PENDING_REFUND`** — Frozen `['refund']` array; the exact value `$set` into the order document as the effect marker.
- **`SWEEP_BATCH_SIZE`** — 200; per-run cap for `retryPendingEffects`.

## Relationships

- **`src/kernel/permissions.ts`** — `callerForSubject` / `SYSTEM_ACTOR` build the caller context for system-initiated cancels (no `AuthContext` available).
- **`src/kernel/events.ts`** — `emitDomainEvent` fires `ORDER_CANCELLED` and `ORDER_REFUND_OWED`; no built-in retry, which is why the refund marker + sweep exist.
- **`src/modules/inventory/index.ts` / `service.ts`** — `inventoryService.releaseForOrder` (releases `held` reservations) and `restockForOrder` (returns `committed` units from paid orders). Both called speculatively; each claims conditionally so a race is safe.
- **`src/modules/orders/domain/index.ts`** — `statusesLeadingTo(OrderStatus.cancelled, actor)` reads the lifecycle table to get the allowed source statuses per actor role.
- **`src/modules/orders/analytics.ts`** — `ordersAnalyticsEvents` provides the event-name constants (`ORDER_CANCELLED`, `ORDER_RESERVATION_EXPIRED`).
- **`src/modules/orders/audit.ts`** — `ordersAuditActions` provides the audit action constant.
- **`src/modules/orders/config.ts`** — `orderEffectRetryMinutes` (used by the sweep's caller for scheduling cadence).
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape the HTTP response returned to the HTTP layer.
- **`src/infrastructure/i18n/index.ts`** — `t()` localizes user-facing messages.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` sends the reservation-expiry explanation.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` writes the audit row.
- **`src/infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` / `buildAnalyticsBase` emit the analytics event.

## Notes

- **Conditional write, not read-check-write.** The `$in: [pending, …]` filter in `updateStatusIfIn` is the only guard against double-cancels or admin-race. The post-null `getById` read exists solely to choose 404 vs 409; the decision is already final.
- **`held` vs `committed` inventory holds.** `releaseForOrder` matches `held → released`; it will *never* match a `committed` (paid) hold. `restockForOrder` handles that path. Both are called sequentially and speculatively—whichever doesn't match is a no-op.
- **Refund is a separate event.** Re-emitting `ORDER_CANCELLED` to retry a stuck refund would re-deliver the customer-facing webhook on every sweep pass. `ORDER_REFUND_OWED` is the dedicated retry channel.
- **`viaReservationExpiry` is load-bearing.** Without it, the reservation-sweep's expiry email and `availability.ts`'s product-removed email (which sends its *own* explanation) would be indistinguishable from a bare missing `context`.
- **Customer refund is unconditional.** Only an `admin` actor can pass `options.refund = false`; a moderator/warehouse operator is forced to refund because their permission key (`orders.any.update`) does not imply the operator-level waiver.
- **No in-app scheduler.** `retryPendingEffects` and the reservation sweep are driven by external `scripts/ops/*` entry points.
