---
source: src/modules/payments/services/disputes.ts
sha256: 85e19c66ca913d1f7ff70cec7308d009354b8ef128db6156461a67dd2854b929
generated_at: 2026-11-08T07:25:37.662797+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/disputes.ts

## Purpose

Handles provider-side dispute reports arriving via webhook delivery. It stores the dispute state on the payment, appends staff-timeline rows to the order, and announces a domain event — all within a single Mongoose transaction. A dispute here is explicitly **not** a refund: it never modifies `amountRefunded`, order status, or credit notes.

## Key elements

- **`applyDisputeDelivery`** (exported) — Entry point. Validates that the report's currency matches the payment's (drops and warns on mismatch), converts the raw report via `recordOf`, and delegates to `storeDispute`.
- **`storeDispute`** — Wraps the write in `announceInTransaction`: calls `paymentRepository.recordDispute`, then `appendRows`, then emits either `PAYMENT_DISPUTE_OPENED` or `PAYMENT_DISPUTE_UPDATED`. Returns `null` (no event) when the report is stale or a repeat.
- **`recordOf`** — Converts a `ProviderDisputeState` (ISO-string dates) into a `DisputeRecord` with real `Date` objects. Stamps `closedAt` to `observedAt` when the status is in `CLOSED_DISPUTE_STATUSES`.
- **`timelineTypes`** — Pure helper that returns which timeline entries the write earns: `dispute_opened` (first report) and/or `dispute_closed` (transitioned from open to closed). A closed→closed transition adds none.
- **`payloadOf`** — Builds the `DisputeEventPayload` shared by both dispute events; uses `padDecimal` for the amount.
- **`appendRows`** — Writes timeline rows **sequentially** via `orderService.appendTimeline` (a Mongoose session does not accept parallel operations).
- **`CLOSED_DISPUTE_STATUSES`** — Readonly set (`won`, `lost`, `accepted`, `closed`) used to decide whether `closedAt` is stamped.

## Relationships

- **`src/kernel/outbox.ts`** — `announceInTransaction` wraps the repository write, timeline append, and event announcement in one transaction; the event is emitted only if the write succeeded.
- **`src/modules/payments/repository.ts`** — `paymentRepository.recordDispute` persists the dispute on the payment and returns a `RecordedDispute` describing the outcome (`opened` / `updated` / `null`).
- **`src/modules/payments/events.ts`** — Provides `PAYMENT_DISPUTE_OPENED`, `PAYMENT_DISPUTE_UPDATED` event names and the `DisputeEventPayload` type.
- **`src/modules/payments/domain/disputes.ts`** (via `../domain`) — `isOpenDispute` is used by `timelineTypes` to decide whether a `dispute_closed` row is warranted.
- **`src/modules/orders/index.ts`** (and `services/index.ts`) — `orderService.appendTimeline` writes the staff-timeline rows inside the same transaction session.
- **`src/domain-primitives/money.ts`** — `padDecimal` formats the monetary amount in event payloads and timeline data.
- **`src/modules/payments/providers/index.ts`** — Supplies the `ProviderDisputeState` type (the shape of the dispute as the delivery carried it).
- **`src/modules/payments/model.ts`** — Supplies `DisputeRecord` and `PaymentDocument` types.
- **`src/types/index.ts`** — `DisputeStatus` enum used for the closed-status set and comparisons.
- **`src/infrastructure/adapters/logger.ts`** — Emits a warning on currency mismatch and an info log on successful/stale application.

## Notes

- **Ordering is by stored `observedAt`, not delivery arrival.** The provider's verified body is the source of truth; some providers cannot be queried later.
- **Stale/repeat reports are a no-op.** `recordDispute` returns `null`, no timeline row is written, and no event is announced. The info log records the skip.
- **Currency mismatch is a silent drop** (warning log, resolved `Promise`), not an error. The rationale is that all refund arithmetic lives in the payment's currency.
- **`closedAt` is not a separate provider field.** It is derived from `observedAt` whenever the status is in `CLOSED_DISPUTE_STATUSES`.
- **Sequential timeline writes are deliberate.** A Mongoose `ClientSession` does not accept concurrent operations, hence the `for…of` loop in `appendRows` rather than `Promise.all`.
- Stryker mutational-testing disable/restore annotations guard the logging branches.
