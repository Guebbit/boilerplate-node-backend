---
source: src/modules/orders/services/cancel.ts
sha256: d2663a7a3bd86c2ed100a5698479987e51a780f183282e98a0434809a6fd75b8
generated_at: 2026-10-15T11:07:07.747828+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/cancel.ts

## Purpose
Implements the single code path for cancelling an order — whether triggered by a customer, an operator, or the system's reservation-expiry sweep. It performs the conditional status transition, releases the order's claim on inventory, and schedules any owed refund, all inside one Mongoose transaction so that a failed stock release rolls the status back with it. Post-commit side effects (refund event, emails, audit, analytics) run outside the transaction.

## Key elements
- **`cancelById`** (exported) — Entry point. Resolves actor kind, permission scope, and refund intent; delegates to `moveToCancelled` then `afterCancel`. Returns `ResponseSuccess` or `ResponseReject`.
- **`moveToCancelled`** (private) — Wraps the atomic step in `announceInTransaction`: conditional `updateStatusIfIn` (carrying the caller's scope), `giveBackStock`, and the `ORDER_CANCELLED` outbox row. Refreshes the inventory stock cache after commit.
- **`giveBackStock`** (private) — Releases a `held` reservation or, for a paid order, releases a `committed` hold via `inventoryService.releaseCommittedForOrder`. Safe to call both speculatively; each claims conditionally.
- **`afterCancel`** (private) — Post-commit fan-out: emits `ORDER_REFUND_OWED` (separate event, retried independently), sends the appropriate email (expiry notice vs. cancellation notice), records audit, emits analytics, and builds the success response.
- **`PENDING_REFUND`** — Frozen `['refund']` marker written into the order document's pending-effects array during the status write.
- **`SWEEP_BATCH_SIZE`** (`200`) — Batch limit for the `retryPendingEffects` sweep that discharges stuck refund markers.

## Relationships
- **`@kernel/permissions`** — `callerForSubject` / `SYSTEM_ACTOR` used to synthesise a caller context for system-initiated cancels (reservation sweep, account erasure).
- **`@kernel/outbox`** — `announceInTransaction` wraps the status write and the `ORDER_CANCELLED` event in a single transactional unit.
- **`@kernel/events`** — `emitDomainEvent(ORDER_REFUND_OWED, …)` publishes the refund intent outside the transaction; discharged on its own retry cadence.
- **`@modules/inventory`** — `inventoryService.releaseForOrder`, `releaseCommittedForOrder`, `refreshStockCacheForOrder` handle the actual stock state changes and cache invalidation.
- **`@infrastructure/adapters/mailer`** — `enqueueEmail` delivers the expiry or cancellation notice to the buyer.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape the HTTP response.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the audit row (system actor for sweep/erasure, real user otherwise).
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` + `buildAnalyticsBase` report `ORDER_CANCELLED` or `ORDER_RESERVATION_EXPIRED` depending on the trigger.
- **`@modules/orders/analytics`** / **`@modules/orders/audit`** — Provide the named event/action constants used above.
- **`@modules/orders/config`** — `orderEffectRetryMinutes` sets the retry window for pending refund effects.
- **`./read`**, **`./timeline`**, **`./notify`**, **`./scope`** — Sibling service helpers: `getById` (post-null read to distinguish 404 vs 409), `withTimeline` (appends the timeline row atomically), `mailBuyer` (locale-aware email dispatch), `cancelScope` / `actorOf` (permission scoping).

## Notes
- **Refund is never in the transaction.** Money at a payment provider cannot roll back. Only the *intent* (the `refund` flag on the `ORDER_CANCELLED` event and the `PENDING_REFUND` marker) is written atomically; `retryPendingEffects` discharges it later. Re-sending `ORDER_CANCELLED` to retry a stuck refund is deliberately avoided — it would re-fire the customer-facing webhook.
- **Conditional write, not read-check-write.** The `updateStatusIfIn` filter carries both the allowed `from` statuses and the caller's ownership scope. A racing admin "shipped" or a double-click resolves at the storage layer; exactly one write matches. The follow-up read on `null` only distinguishes 404 from 409.
- **`viaReservationExpiry` vs `byPerson`** control which email and which analytics event fire. A reservation expiry never mails the "cancelled" template, and a person-initiated cancel never reports as a timeout.
- **`refund` is not waivable by the customer.** Only an actor with `orders.any.update` (operator/moderator) may set `refund: false`; a withdrawal always refunds in full.
- **`giveBackStock` is safe to call speculatively.** Each inventory release is conditional on the hold's current state, so calling both `releaseForOrder` and `releaseCommittedForOrder` in sequence never double-releases.
- **System cancels are still audited.** A missing `context` (sweep, erasure) does not skip the audit row; it is recorded under `SYSTEM_ACTOR`.
