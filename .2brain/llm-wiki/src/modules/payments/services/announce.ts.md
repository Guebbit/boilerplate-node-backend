---
source: src/modules/payments/services/announce.ts
sha256: 445ba406ac00d309f8d5fa8d67605d27097a8968dbb212b510a4a849293c0195
generated_at: 2026-11-08T07:25:10.240331+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/announce.ts

## Purpose

Moves a payment to `declined` and emits a `PAYMENT_FAILED` event in a single transactional unit, so a decline that commits is always announced and one that loses a race is never. This is the announce side of the payment lifecycle; `PAYMENT_SUCCEEDED` is handled separately by `settlement.ts`.

## Key elements

- **`recordDecline(orderId, extra, newAttempt?)`** — The sole export. Calls `paymentRepository.updateStatusIfIn` to set status to `'declined'`, appends a `payment_declined` timeline entry on the order, and registers a `PAYMENT_FAILED` outbox event — all inside one `announceInTransaction` session. Returns the updated `PaymentDocument` or `null` if the status move did not apply.

## Relationships

- **`src/kernel/outbox.ts`** — Provides `announceInTransaction`, the wrapper that binds the status write, timeline append, and event row into one atomic commit.
- **`src/modules/payments/events.ts`** — Source of the `PAYMENT_FAILED` event name constant.
- **`src/modules/payments/domain/index.ts`** → **`domain/lifecycle.ts`** — Source of `SETTLEABLE_PAYMENT_STATUSES`, the guard set that determines which current statuses can transition to `declined`.
- **`src/modules/payments/repository.ts`** — `paymentRepository.updateStatusIfIn` performs the conditional status write within the shared session.
- **`src/modules/orders/index.ts`** → **`orders/services/index.ts`** — `orderService.appendTimeline` records a `payment_declined` entry on the order in the same transaction.
- **`src/modules/payments/services/settlement.ts`** — Sibling service that handles the `PAYMENT_SUCCEEDED` path (not this file).
- **`src/modules/payments/tests/integration/announce.test.ts`** — Integration tests for `recordDecline`.
- **`src/modules/payments/tests/integration/timeline.test.ts`** — Verifies the timeline side-effect.

## Notes

- **`newAttempt` semantics matter.** When `true` (the confirm/attempt path), a payment already in `declined` *can* be declined again — a second card failure is a new decline. When `false` (webhook, sync, poll), `declined` is filtered out of the allowed source statuses so duplicate provider events (Stripe sends two for one decline) do not re-announce.
- The timeline entry stores only `paymentId`; the provider's human-readable error text is deliberately not copied into the order timeline.
- This file never handles success. If you are looking for `PAYMENT_SUCCEEDED` emission, go to `settlement.ts`.
- The module doc comment references `docs/tools/outbox.md` for the outbox pattern details.
