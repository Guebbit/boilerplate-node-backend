---
source: src/modules/payments/openapi.yaml
sha256: bba0798f3b0740a4b364edc9fce60086250452f48c45c606d0fae19c18102826
generated_at: 2026-10-29T05:07:24.218625+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the payments module. Declares the module's operations (payment methods, payment lifecycle, staff list/search), its custom error-code vocabulary, and the slice it contributes to the account data export. Serves as the single source of truth for both server implementation and client SDK generation.

## Key elements

- **`x-error-codes`** — Module-level extension listing every payment-specific error (e.g. `PAYMENT_DECLINED`, `PAYMENT_IN_FLIGHT`, `PAYMENT_DISPUTED`, `PAYMENT_REFUND_EXCEEDS_REMAINING`) with its HTTP status and a human-readable description. Shared responses (409, 422, etc.) remain generic; this map carries the *meaning*.
- **`x-personal-data`** — Declares the `payments` array (items: `ExportPayment`) that the bundler injects into `AccountExportResponse` for `POST /account/export`.
- **`paths./payments/methods` (GET)** — Public endpoint; returns the configured payment methods so the frontend hard-codes none.
- **`paths./payments` (GET)** — Staff list with rich filtering (display status, method, provider, amount range, disputed flag, RF transfer reference, etc.). Returns `PaymentsResponse` rows that include `actions`, `orderNumber`, `email`, and provider refs.
- **`paths./payments` (POST)** — Creates or refreshes a payment intent from the caller's pending order. 201 = created, 200 = already existed (refresh). Rate-limited via a shared `paymentIntentLimiter` budget with the sync endpoint.
- **`paths./payments/search` (POST)** — `x-alias-of: listPayments`; same semantics as `GET /payments` but with filters in a JSON body (`SearchPaymentsRequest`).
- **`tags: Payments`** — Groups all operations under one tag with a descriptive summary.
- **Referenced schemas** (defined in the `components` section, truncated in view): `Payment`, `PaymentMethodsResponse`, `PaymentsResponse`, `CreatePaymentRequest`, `SearchPaymentsRequest`, `PaymentSort`, `PaymentDisplayStatus`, `PaymentMethodKind`, `ExportPayment`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — All shared, cross-module artifacts are pulled from here via relative `$ref` (`../../../shared/contracts/openapi.root.yaml`):
  - Parameters: `PageParam`, `PageSizeParam`
  - Schemas: `Id`
  - Responses: `Unauthorized`, `Forbidden`, `ValidationError`, `NotFound`, `Conflict`, `TooManyRequests`
  - Headers: `Location`

  This keeps generic HTTP semantics centralized while the module file only adds payment-specific meaning.

## Notes

- **201 vs 200 on `POST /payments`:** 201 means a new intent was created; 200 means the order already had an intent and it was merely refreshed. No `Idempotency-Key` header is required because the DB enforces one-payment-per-order.
- **`x-alias-of` extension:** Non-standard; used by tooling to treat `searchPayments` as a body-based variant of `listPayments` rather than a separate operation.
- **RF transfer reference matching:** `transferReference` accepts spaces and arbitrary case (e.g. `RF13 2EY8 H44V JAVZ KX80 JRL`); an invalid reference yields an empty result set, not an error.
- **Error-code map is authoritative for semantics:** The HTTP status codes in `x-error-codes` (mostly 409, some 422) map to the shared `Conflict` / `ValidationError` responses, but the *which* error a caller should branch on is this module's `x-error-codes` list, not the response body structure.
- The file is truncated in this view; additional paths (confirmation, sync, refunds, disputes) are implied by the error-code entries and the tag description.
