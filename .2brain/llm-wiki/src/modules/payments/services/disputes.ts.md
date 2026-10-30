---
source: src/modules/payments/services/disputes.ts
sha256: 5649f57e0528d39a764b3cd4247468393fb1e00025e9fb5a5f8eb9ee40195235
generated_at: 2026-10-29T05:10:04.688190+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/disputes.ts

## Purpose

Applies a dispute report carried by a provider webhook delivery onto its payment. It records the dispute state on the payment, appends staff timeline rows, and announces a `payment.dispute_opened` or `payment.dispute_updated` domain event — all within a single database transaction. A dispute is explicitly **not** a refund: it never mutates `amountRefunded`, order status, or credit notes.

## Key elements

- **`applyDisputeDelivery`** (exported) — Entry point. Validates currency match, converts the provider report to a stored record, and delegates to `storeDispute`. Returns a resolved promise on currency mismatch (warn-logged, no write).
- **`storeDispute`** (internal) — Wraps `paymentRepository.recordDispute` + timeline writes + event announcement inside `announceInTransaction`. Returns `RecordedDispute | null` (null = stale/repeat, no event fired).
- **`recordOf`** (internal) — Maps `ProviderDisputeState` (ISO-string dates) → `DisputeRecord` (revived `Date` objects). Stamps `closedAt = observedAt` when the status is in `CLOSED_DISPUTE_STATUSES`.
- **`timelineTypes`** (internal) — Determines which timeline entries the write earns: `dispute_opened` on first record, `dispute_closed` on open→closed transition. A closed-to-closed ("late win") transition yields none.
- **`appendRows`** (internal) — Writes the determined timeline rows via `orderService.appendTimeline`, sequentially within the transaction session.
- **`payloadOf`** (internal) — Builds the shared `DisputeEventPayload` for both event names.
- **`CLOSED_DISPUTE_STATUSES`** — `ReadonlySet` of `won`, `lost`, `accepted`, `closed`.

## Relationships

- **`@kernel/outbox`** — `announceInTransaction` provides the single-transaction boundary for the repository write, timeline appends, and outbox event announcement.
- **`@modules/orders`** (`orderService`) — `appendTimeline` writes staff-facing timeline rows inside the same transaction session.
- **`../domain`** (payments domain barrel) — Supplies `isOpenDispute`, used by `timelineTypes` to detect open→closed transitions. The doc comment also points to `domain/disputes.ts` for the rules a dispute imposes on refunds.
- **`../repository`** — `paymentRepository.recordDispute` performs the actual upsert and returns the `RecordedDispute` outcome.
- **`../events`** — Event name constants (`PAYMENT_DISPUTE_OPENED`, `PAYMENT_DISPUTE_UPDATED`) and the `DisputeEventPayload` type.
- **`../model`** — `DisputeRecord` and `PaymentDocument` type shapes.
- **`../providers`** — `ProviderDisputeState` type (the raw shape delivered by the provider webhook).
- **`@infrastructure/adapters/logger`** — Structured `warn` / `info` logs for currency-mismatch drops and post-apply outcomes.
- **`@types`** — `DisputeStatus` enum used in `CLOSED_DISPUTE_STATUSES`.

## Notes

- **Currency guard is a silent drop.** If `report.currency !== payment.currency`, the function logs a warning and resolves without writing anything. No exception is thrown; no event is announced.
- **`closedAt` is derived, not provider-supplied.** It is always set to `observedAt` for closed statuses; there is no separate `closedAt` field in the provider payload.
- **Sequential timeline writes.** `appendRows` iterates with `for…of` + `await` because a Mongoose transaction session does not accept parallel operations.
- **Idempotency via repository.** Stale or repeated reports are detected inside `paymentRepository.recordDispute` (returns `null`); this file simply checks for `null` and skips the event.
- **Ordering semantics.** Dispute history is ordered by the stored `observedAt`, not by webhook arrival time.
- **Stryker mutation-testing markers** wrap every `logger` call (the calls are considered "unobservable" for mutation coverage).
