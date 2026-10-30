---
source: src/modules/payments/services/offline.ts
sha256: 379bfd90a1e0aab7e3d64c8dbe52ab67bd3994134fe6edd6a5c398111bd740e2
generated_at: 2026-10-29T05:12:13.963562+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/offline.ts

## Purpose

Records payments that arrived outside the card provider (cash at the counter, bank transfer, phone-order payment) and settles them through the same `settlePayment` pipeline every card payment uses — moving the order `pending → paid`, committing stock, and firing the standard status/payment events.

## Key elements

- **`OfflinePaymentInput`** — Parsed request body: `method` (any `PaymentMethod` except `'card'`), optional `reference`, optional `receivedAt`.
- **`recordOfflinePayment(orderId, input, context)`** — The single export. Validates the timestamp, looks up the order, checks payability via `isPayable`, cancels any open card intent, upserts the payment row, calls `settlePayment`, records audit + analytics, and returns `201` (new row) or `200` (converted existing row). Handles the late-transfer edge case where money lands after the order was cancelled.

## Relationships

- **`./settlement`** (`settlePayment`, `settlementResponse`) — Delegates the actual settlement; the offline path is not a separate settlement, it feeds into the shared one.
- **`./intent`** (`cancelOpenIntent`) — Closes any still-open provider intent before overwriting the payment row, to prevent a late provider charge from landing with no local row to reconcile.
- **`@modules/orders`** (`orderService.getById`, `buyerIdOf`, `orderTotal`, `isPayable`) — Order lookup, payer resolution, total computation, and the lifecycle "can this order still take a payment?" rule.
- **`@modules/access`** (`ownOrderFlag`) — Flags the audit row when the acting admin is also the order's buyer.
- **`../repository`** (`paymentRepository.upsertOffline`, `findByOrderId`) — Persistence for the offline payment row.
- **`@infrastructure/http/response`** (`fieldError`, `generateSuccess`, `generateReject`) — Shaped API responses (200/201/409/422/404).
- **`@infrastructure/i18n`** (`t`) — Localized error messages (`payments.received-at-future`, `payments.in-flight`).
- **`@infrastructure/observability/audit`** / **`../audit`** — Audit-trail entry with `paymentsAuditActions.PAYMENT_RECORDED_OFFLINE`.
- **`@infrastructure/observability/analytics`** / **`../analytics`** — Analytics event with `paymentsAnalyticsEvents.PAYMENT_RECORDED_OFFLINE`.

## Notes

- **Unscoped order lookup** — This is an operator action (gated by `create:Payment` at the route); the caller is never restricted to their own orders.
- **Mongoose spread pitfall** — The upsert uses explicit fields (`amount`, `currency`, etc.) rather than spreading the order document, because Mongoose schema paths are prototype getters and would be lost in a spread.
- **201 vs 200** — `201` only when the payment row is genuinely new; recording over an existing unpaid card-intent row returns `200`.
- **Late-transfer branch** — If a transfer lands after the order was cancelled, it is recorded onto the existing `cancelled` payment row (keeping the reference) and returned as the response rather than rejected, so the money is not left unrecorded.
- **`isPayable` from the orders domain** — The payability check is delegated to the orders lifecycle module rather than hard-coded here, keeping a single source of truth for the status rule.
