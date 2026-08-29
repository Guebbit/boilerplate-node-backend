# src/modules/payments/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract (v2.0.0) for the Payments module. Defines the four endpoints that manage the money-side of an order lifecycle — creating a payment intent, looking up a payment by order, confirming a charge, and issuing a refund — plus the `Payment` schema and its supporting types. Serves as the single source of truth for the API surface that the orders module and clients depend on.

## Key elements

- **`POST /payments/intent`** (`createPaymentIntent`) — Freezes a caller's `pending` order into a payment intent; idempotent (one intent per order, enforced by the DB). Returns a `PaymentEnvelope`.
- **`GET /payments/order/{orderId}`** (`getPaymentByOrder`) — Retrieves the existing payment for an order so a client can resume mid-flow. Returns 404 if no intent exists yet.
- **`POST /payments/order/{orderId}/refund`** (`refundPaymentByOrder`) — Admin-only refund. Conditional write: only succeeds while the payment is `succeeded`; a second attempt returns 409 (`PAYMENT_NOT_REFUNDABLE`).
- **`POST /payments/{id}/confirm`** (`confirmPayment`) — Charges the card (provider-first), then conditionally moves the order `pending → paid`. Decline returns 409 with `PAYMENT_DECLINED` and is retryable. If the order state has already changed, the charge is refunded on the spot.
- **`Payment`** schema — Provider-facing record (id, orderId, userId, amount, currency, status, provider, cardLast4, actions, timestamps). Status enum: `requires_confirmation | succeeded | declined | refunded`.
- **`PaymentActions`** schema — Per-caller boolean flags (`pay`, `refund`) computed at read time, mirroring the `Order.actions` convention.
- **`PaymentEnvelope`** schema — Standard `{ success, status, message, data }` wrapper around `Payment`.
- **`CreatePaymentIntentRequest`** / **`ConfirmPaymentRequest`** — Request bodies for the intent and confirm endpoints.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Heavily referenced: all envelope fields (`EnvelopeSuccess`, `EnvelopeStatus`, `EnvelopeMessage`), the `Id` schema, the `IdPathParam` parameter, and every shared error response (401, 403, 404, 409, 422, 500) are `$ref`-imported from this file. This spec never redefines those types.
- **`src/modules/orders/openapi.yaml`** — The payment intent is derived from an order's lines; `confirmPayment` transitions the order to `paid`; `refundPaymentByOrder` deliberately does *not* alter the order's status. The two modules split the lifecycle: orders own the customer-facing status, payments own the money.

## Notes

- The 409 response is overloaded across endpoints but disambiguated by `errors[].code` (`PAYMENT_ORDER_NOT_PAYABLE`, `PAYMENT_DECLINED`, `PAYMENT_NOT_REFUNDABLE`, `PAYMENT_NOT_CONFIRMABLE`). Clients must branch on the code, not just the status.
- `Payment.actions` is computed per caller at response time (not persisted), same convention as `Order.actions`. A client that needs both action sets composes them rather than making cross-module decisions.
- The `provider` field is `fake` in the demo; the fake provider declines exactly one card number (documented on `ConfirmPaymentRequest.cardNumber`).
- `amount` on the intent is locked from the order's own lines at creation time — the intent cannot quote a different total.
- The confirm endpoint is charge-then-write: money moves at the provider before the DB update, so a race on the order state triggers an automatic on-the-spot refund rather than a lost payment.
