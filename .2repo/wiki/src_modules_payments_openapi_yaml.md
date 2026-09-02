# src/modules/payments/openapi.yaml

## Purpose

OpenAPI 3.0.3 module contract for the Payments service (v2.0.0). Defines the four HTTP endpoints that manage the lifecycle of a payment (create intent → confirm → refund) tied to an order, along with the `Payment` schema and caller-specific `PaymentActions`. Serves as the single source of truth for client code generation and API documentation.

## Key elements

- **`POST /payments/intent`** — Freezes a caller's `pending` order into a payment intent (amount locked from order lines). Idempotent: re-calling refreshes the same intent; an already-paid order returns 409.
- **`GET /payments/order/{orderId}`** — Retrieves the existing payment record for an order (404 if none yet). Used by clients to re-hydrate state mid-flow.
- **`POST /payments/order/{orderId}/refund`** — Admin-only. Returns funds without changing order status. Conditional write: second submit gets 409 (`PAYMENT_NOT_REFUNDABLE`).
- **`POST /payments/{id}/confirm`** — Submits card details to the provider. Provider charges first; order transitions `pending → paid` via conditional write. Decline (409, `PAYMENT_DECLINED`) is retryable with a new card.
- **`Payment` schema** — Provider-facing record: `id`, `orderId`, `amount`, `currency`, `status` (`requires_confirmation | succeeded | declined | refunded`), `provider`, `cardLast4`, computed `actions`.
- **`PaymentActions` schema** — Per-caller booleans (`pay`, `refund`) indicating which endpoints would accept the request. Mirrors the `Order.actions` pattern.
- **`PaymentEnvelope`** — Standard response wrapper (`success`, `status`, `message`, `data`) around `Payment`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — All shared response definitions (401, 403, 404, 409, 422, 500), the `Id` schema, and the `IdPathParam` parameter are imported via `$ref`. This file does not redefine them.
- **`src/modules/orders/openapi.yaml`** — No direct `$ref` in this file, but the API is coupled by design: every endpoint is scoped to an `orderId`, the confirm endpoint drives the order's `pending → paid` transition, and `PaymentActions.pay` checks whether the order can still reach `paid`. Clients that need both order and payment actions compose them at runtime.

## Notes

- `userId` on `Payment` is optional and **absent** once the account is erased — do not treat it as a required join key.
- `declined` is **not** terminal; the same payment ID can be re-submitted to `/confirm` with a different card. `refunded` is terminal.
- The confirm endpoint's 409 is overloaded: `PAYMENT_DECLINED` (retryable), `PAYMENT_NOT_CONFIRMABLE` (state), and `PAYMENT_ORDER_NOT_PAYABLE` (order slipped, charge auto-refunded). Distinguish by `errors[].code`.
- `cardLast4` is the only card data persisted by policy; the full PAN exists only in the request body and is never stored.
- The fake provider declines exactly one card number (documented on `ConfirmPaymentRequest.cardNumber`) — useful for exercising the decline path in tests.
