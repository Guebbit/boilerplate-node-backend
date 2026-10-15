---
source: src/modules/payments/services/notify.ts
sha256: 4a332b95794d0bc3fb9638028b42a7894673c669a59729e40c6876eb478c9fb1
generated_at: 2026-10-15T11:30:42.138458+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/notify.ts

## Purpose

Event-listener handlers that send buyer-facing notification emails when a payment settles (`payment.succeeded`) or a refund is recorded (`payment.refunded`). Using listeners instead of inline sends ensures every settlement path (webhook, browser confirm, offline record, crash-recovery sweep) triggers the mail. A mail failure is logged and swallowed — it must never roll back money that already moved.

## Key elements

- **`mailPaymentReceived`** (exported) — Handles `payment.succeeded`. Looks up the order via `orderService.getById`, then queues a `paymentReceivedEmail` through `enqueueEmail`. This is the buyer's confirmation that their card actually went through.
- **`mailRefundIssued`** (exported) — Handles `payment.refunded`. Fetches the payment and order in parallel, locates the specific refund, applies skip rules (see Notes), then queues a `refundIssuedEmail` with a `completesPayment` flag.
- **`moneyWentBack`** (private) — Returns `true` if the refund carries a `providerRefundRef` **or** the payment was `refundedByHand`; distinguishes a real money movement from a corrupted-row settle.
- **`completesPayment`** (private) — Sums all successful refund records settled up to (and including) the target refund and compares to the payment total via `toMinorUnits`. Reads from the record list, not the payment's current status, so a later refund can't retroactively change what an earlier one reports.

## Relationships

- **`@infrastructure/adapters/logger`** — Imports `logger`; used to log-and-swallow errors in both catch blocks.
- **`@infrastructure/adapters/mailer`** — Imports `enqueueEmail`; the actual transport for both outbound messages.
- **`@kernel/events`** — Imports the `DomainEventMap` type to type the event payloads each handler receives.
- **`@modules/orders` (→ `orders/services`)** — Imports `orderService`; calls `getById` to resolve the order and `mailBuyer` to render the email in the buyer's locale.
- **`../emails`** — Imports `paymentReceivedEmail` and `refundIssuedEmail` template builders (subject, template, data).
- **`../repository`** — Imports `paymentRepository`; `mailRefundIssued` calls `findByOrderId` to fetch the payment document.
- **`../model`** — Imports `PaymentDocument` and `RefundRecord` types used in the helper predicates.
- **`../services/index`** — Re-exports the two handlers so the module can wire them as listeners.
- **`@shared-kernel/money`** — Imports `toMinorUnits` for currency-safe amount comparison in `completesPayment`.
- **`@types`** — Imports `RefundStatus` (specifically `.succeeded`) to filter settled refund records.

## Notes

- **Refund skip rule:** `mailRefundIssued` bails if `refund.returnId` is set **and** the reason is not `'cancellation'`. A return's refund is covered by the returns module's own closing notice; a cancellation (remainder) refund has no such notice and is mailed here.
- **Idempotency-safe:** Both handlers are side-effect-only (log + enqueue). They never write to the payment or order, so re-delivery of an event is harmless.
- **Stryker comments** (`// Stryker disable all` / `restore all`) wrap the error-logging blocks to exclude the intentional no-op catch from mutation-coverage requirements.
- **`completesPayment`** intentionally uses `<=` on `settledAt` (ties broken by `_id` equality) so concurrent settlements on the same timestamp are still counted.
