---
source: src/modules/payments/services/announce.ts
sha256: 445ba406ac00d309f8d5fa8d67605d27097a8968dbb212b510a4a849293c0195
generated_at: 2026-10-15T11:29:08.014096+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/announce.ts

## Purpose

Provides the single entry point for recording a declined payment. It atomically writes the `declined` status, appends the order timeline row, and enqueues a `PAYMENT_FAILED` outbox event in one transaction, so a decline either fully lands (status + timeline + event) or does not at all. This is the counterpart to `settlement.ts`, which owns the `PAYMENT_SUCCEEDED` announcement.

## Key elements

- **`recordDecline(orderId, extra, newAttempt?)`** — the sole export. Moves a payment to `declined` via a conditional update (`updateStatusIfIn`), appends a `payment_declined` timeline entry to the order, and publishes `PAYMENT_FAILED` through the transactional outbox. Returns the updated `PaymentDocument` or `null` if the payment was not in a settleable state.
  - `extra: Partial<PaymentDocument>` — provider-specific fields (e.g. provider reference, last error) stored alongside the status.
  - `newAttempt: boolean` (default `false`) — controls which source statuses are eligible. `true` (the caller *is* the attempt, e.g. a confirm) allows re-declining an already-`declined` payment; `false` (the caller is *observing*, e.g. a webhook or sync) excludes `declined` from the source set to prevent duplicate announcements.

## Relationships

- **`src/kernel/outbox.ts`** — `announceInTransaction` wraps the status write, timeline append, and event row into a single transactional unit.
- **`src/modules/orders/index.ts` / `src/modules/orders/services/index.ts`** — `orderService.appendTimeline` writes the `payment_declined` timeline row within the same session/transaction.
- **`src/modules/payments/events.ts`** — supplies the `PAYMENT_FAILED` event name constant.
- **`src/modules/payments/domain/index.ts`** — supplies `SETTLEABLE_PAYMENT_STATUSES`, the set of statuses from which a decline transition is valid.
- **`src/modules/payments/model.ts`** — `PaymentDocument` type used in the return value and `extra` parameter.
- **`src/modules/payments/repository.ts`** — `paymentRepository.updateStatusIfIn` performs the conditional status write.
- **`src/modules/payments/services/settlement.ts`** — sibling service that owns the success path (`PAYMENT_SUCCEEDED`); this file explicitly does *not* handle it.
- **`src/modules/payments/tests/integration/announce.test.ts`** — integration tests for the decline-announce flow.
- **`src/modules/payments/tests/integration/timeline.test.ts`** — integration tests covering the timeline-append side effect.

## Notes

- The `newAttempt` flag is the deduplication mechanism. Stripe can emit two webhook events for a single decline, and a poller may repeat it; passing `newAttempt: false` narrows the source-status filter to exclude `declined`, so a second observation is a no-op (returns `null`) rather than re-announcing.
- The timeline entry stores only the `paymentId`, not the provider's free-text error wording.
- `PAYMENT_SUCCEEDED` is deliberately out of scope here; see `settlement.ts`.
