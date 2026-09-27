---
source: src/modules/payments/openapi.yaml
sha256: f7d879671da791ba3e6b7363171d4f48e8668194e88519dc27084204392ef834
generated_at: 2026-09-27T15:24:07.247377+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the payments module. It defines the full API surface a client needs to discover payment methods, create and confirm a payment intent tied to a pending order, look up payment state by order, and (admin-only) refund, record offline payment, or resolve an RF creditor reference back to an order.

## Key elements

- **`GET /payments/methods`** (`listPaymentMethods`) — public; returns which methods (`card`, optionally `bank_transfer`) this deployment offers.
- **`POST /payments/intent`** (`createPaymentIntent`) — authenticated; freezes a caller's `pending` order into a payment intent. Idempotent via `Idempotency-Key`; 409 if the order is no longer payable or the key is in-flight.
- **`GET /payments/order/{orderId}`** (`getPaymentByOrder`) — authenticated; retrieves the payment record for one of the caller's orders (404 if no intent exists yet).
- **`GET /payments/order-by-reference`** (`getOrderByReference`) — admin; resolves an RF creditor reference (mod-97 validated) to an order. Returns 404 for both malformed and unmatched references. Requires a fresh session (stale token → 401 `REAUTH_REQUIRED`).
- **`POST /payments/order/{orderId}/refund`** (`refundPaymentByOrder`) — admin; refunds a `succeeded` payment. Conditional write: second submit gets 409. Requires fresh session.
- **`POST /payments/order/{orderId}/offline`** (`recordOfflinePayment`) — admin; records a payment that bypassed the card provider (cash, transfer, etc.), marking it `manual` and running the same settlement path as a confirmed intent. Requires fresh session.
- **Schemas** (referenced via `#/components/schemas/…`): `PaymentMethodsResponseEnvelope`, `CreatePaymentIntentRequest`, `PaymentEnvelope`, `OrderByReferenceResponseEnvelope`, `RecordOfflinePaymentRequest`, plus the `Payment` / `PaymentMethods` data shapes defined in the truncated portion of the file.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — every error response (`InternalError`, `Unauthorized`, `NotFound`, `Conflict`, `ValidationError`, `Forbidden`), the `Idempotency-Key` parameter, and the `Id` path-parameter schema are `$ref`-imported from this shared root document. This file contributes no shared error or parameter definitions of its own.

## Notes

- Several admin endpoints (`order-by-reference`, `refund`, `offline`) enforce a **re-authentication window**: a valid-but-stale bearer token yields 401 with `errors[].code = REAUTH_REQUIRED`; the client must re-authenticate and retry.
- `POST /payments/intent` and `POST /payments/order/{orderId}/offline` both accept an `Idempotency-Key` header (imported from the shared root), but `GET` endpoints do not.
- The `order-by-reference` endpoint is deliberately **non-oracle**: a malformed reference and a well-formed-but-unmatched reference both return 404 with no distinguishing body, so an attacker cannot confirm whether a near-miss code was close.
- OpenAPI `links` objects wire `createPaymentIntent → confirmPayment` and `getOrderByReference → recordOfflinePayment` as the expected next-step operations, but `confirmPayment` is defined in a separate spec (not in this file's visible paths).
- The file is truncated in the graph; the `components.schemas` block and any `RecordOfflinePaymentRequest` fields are not fully visible here.
