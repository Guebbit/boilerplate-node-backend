---
source: src/modules/payments/openapi.yaml
sha256: d1d3915a6a6a45cee3d7c46686a97ac296cb195d00655bfe818179e91faefd17
generated_at: 2026-09-23T19:19:02.795970+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/openapi.yaml

## Purpose

OpenAPI 3.0.3 module contract for the payments service. It defines the full HTTP surface of the payments module — public method discovery, payment-intent lifecycle, order-level payment lookup, RF-reference search, refund, and offline-payment recording — so that client code, gateway configs, and human readers share a single authoritative description of endpoints, schemas, and error semantics.

## Key elements

- **`GET /payments/methods`** (`listPaymentMethods`) — Public, unauthenticated. Returns the set of payment methods available to this deployment (`card` always; `bank_transfer` conditionally).
- **`POST /payments/intent`** (`createPaymentIntent`) — Authenticated. Freezes a `pending` order into a payment intent; amount is derived from the order's lines. Idempotent per order (409 on repeat). Accepts `Idempotency-Key` header. Response links to a `confirmPayment` operation (defined elsewhere in this spec or an adjacent file).
- **`GET /payments/order/{orderId}`** (`getPaymentByOrder`) — Authenticated. Retrieves the existing payment record for one of the caller's orders; 404 if no intent exists yet.
- **`GET /payments/order-by-reference`** (`getOrderByReference`) — Admin-only, re-auth required (`REAUTH_REQUIRED` on stale token). Looks up an order by its RF creditor reference (spaces/case tolerated, mod-97 validated). Malformed and unmatched both return 404. Response links to `recordOfflinePayment`.
- **`POST /payments/order/{orderId}/refund`** (`refundPaymentByOrder`) — Admin-only, re-auth required. Returns the money without changing order status. Conditional on payment being `succeeded`; 409 on double-submit. Accepts `Idempotency-Key`.
- **`POST /payments/order/{orderId}/offline`** (`recordOfflinePayment`) — Admin-only, re-auth required. Records cash/transfer payments the card provider never saw. Writes the payment as `manual`, transitions order `pending → paid`, commits stock, and fires `ORDER_STATUS_CHANGED` + `PAYMENT_SUCCEEDED`. Amount is always the order's own total.
- **Schemas** (in `components/schemas`, truncated in source): `PaymentMethodsResponseEnvelope`, `CreatePaymentIntentRequest`, `PaymentEnvelope`, `OrderByReferenceResponseEnvelope`, `RecordOfflinePaymentRequest`.
- **Security schemes**: `bearerAuth` for all mutating/reading endpoints; `security: []` (explicit no-auth) on `GET /payments/methods`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — This spec `$ref`s into that root file for:
    - Shared error response objects: `InternalError`, `Unauthorized`, `NotFound`, `Conflict`, `ValidationError`, `Forbidden`.
    - Shared parameter: `IdempotencyKeyHeader`.
    - Shared schema: `Id` (used for all `orderId` path parameters).

    The module spec never redefines these; it inherits them by relative path (`../../../shared/contracts/openapi.root.yaml#/…`).

## Notes

- **Re-auth gate**: Three admin endpoints (`order-by-reference`, `refund`, `offline`) require the session to have re-proved itself within the last few minutes. A valid-but-stale token yields **401** with `errors[].code: REAUTH_REQUIRED` — the client re-authenticates and retries the same request. This is distinct from ordinary 401.
- **Idempotency**: Both `POST /payments/intent` and the two admin mutation endpoints accept an `Idempotency-Key` header. A key naming a still-in-flight request answers 409.
- **One payment per order**: Re-creating an intent for the same order is a no-op refresh (not a new intent). An order whose money already moved answers 409. This is enforced at the database level.
- **404 ambiguity on `order-by-reference`**: A malformed RF reference (fails mod-97) and a well-formed one matching no order both return 404 with no distinguishing code, by design — the API does not reveal whether an "almost-right" code was close.
- **Offline payments have no partial/over-payment**: The amount is always the order's own total; deviations are handled off-system.
- **`confirmPayment` operation**: Referenced via OpenAPI `links` in two responses but not defined within the visible portion of this file; it is expected to exist elsewhere in the full spec (likely under `POST /payments/{id}/confirm`).
