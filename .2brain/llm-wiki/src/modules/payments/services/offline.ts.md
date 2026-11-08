---
source: src/modules/payments/services/offline.ts
sha256: 99b0261e741cf74d1155fc2eb94b5c21f4d70491acb29c0466b9d9796a0aee7f
generated_at: 2026-11-08T07:27:55.629367+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/offline.ts

## Purpose

Records a payment that arrived outside the card provider (cash, bank transfer, phone-order payment) and settles it through the same `settlePayment` path every card payment uses — order moves `pending → paid`, stock commits, and the standard events fire. It exists so that non-card money flows through identical domain logic rather than a parallel settlement branch.

## Key elements

- **`OfflinePaymentInput`** (interface) — Parsed request body: `method` (any `PaymentMethod` except `'card'`), optional `reference`, optional `receivedAt` (ISO string).
- **`recordOfflinePayment(orderId, input, context)`** (async function) — The sole service entry point. Validates the date, loads the order, handles the late-transfer edge case, cancels any open provider intent, upserts the payment row, settles it, then records audit + analytics and returns a `201`/`200` success or an appropriate `ResponseReject`.

## Relationships

- **`@infrastructure/http/response`** — Provides `generateSuccess`, `generateReject`, `fieldError`, and the `ResponseSuccess`/`ResponseReject` union types used for every return path.
- **`@infrastructure/i18n`** — `t()` translates user-facing error messages (future date, in-flight payment).
- **`@infrastructure/observability/audit`** — `recordAudit` writes the `PAYMENT_RECORDED_OFFLINE` audit row.
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` / `buildAnalyticsBase` emit the `PAYMENT_RECORDED_OFFLINE` analytics event.
- **`@modules/orders`** — `orderService.getById` loads the order; `isPayable` gates settlement eligibility; `orderTotal` derives the amount; `buyerIdOf` resolves the payer identity.
- **`@modules/access`** — `ownOrderFlag` adds an `ownOrder` boolean to audit metadata when the admin is recording a payment on their own order.
- **`../audit`** — `paymentsAuditActions` supplies the canonical action constant for the audit log.
- **`../analytics`** — `paymentsAnalyticsEvents` supplies the canonical event name for analytics.
- **`../model`** — `PaymentDocument` type shapes the success payload.
- **`../providers`** — `PaymentInFlightError` is caught around `cancelOpenIntent` to return a 409 if the provider still has a live charge in flight.
- **`./intent`** — `cancelOpenIntent` closes a still-open card intent before the offline row overwrites it.
- **`./settlement`** — `settlePayment` performs the actual state transition; `settlementResponse` formats the rejection when the order is lost during settlement.
- **`./errors`** — `orderNotFound` and `notPayable` provide standard 404/422 rejects.

## Notes

- **Unscoped order lookup.** `orderService.getById` is called without a tenant/owner filter; access control is the route's responsibility (`create:Payment` guard). Recording on one's own order is permitted and only *flagged* in the audit row.
- **Late-transfer branch.** If the existing payment is `canceled` *and* carries a `transferReference` *and* the order is no longer payable, the money is recorded onto that existing row and settled as a "known, recorded outcome" rather than rejected. This is the one path where `settlement.orderLost` is *not* turned into an error response.
- **Explicit field extraction on upsert.** The `amount`/`currency` fields are pulled individually from the order; the code comments warn that spreading a hydrated Mongoose document copies nothing because schema paths live on the prototype.
- **Status-code semantics.** `201` is returned only when `created` is true (a brand-new row); upserting over a prior unpaid card intent yields `200`.
- **`isPayable` is delegated to the orders domain** rather than compared against a literal status here, so the rule lives in one place.
- **Flat `await` chain** (no nested `.then()` pyramids) — each step depends on the previous step's resolved value, matching the convention in `@modules/orders`'s `crud.ts`.
