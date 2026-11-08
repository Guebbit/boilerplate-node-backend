---
source: src/modules/payments/openapi.yaml
sha256: 8969354fc40cb16cf990dc08458e45553ec46020c09677bb03f6caa1c6e73c83
generated_at: 2026-11-08T07:22:38.768321+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/openapi.yaml

## Purpose
OpenAPI 3.1.0 contract for the **payments** module. It declares the module's public API surface (endpoints, schemas, error codes, and personal-data export shape) so the runtime bundler can register routes, validate requests, and generate client SDKs from a single source of truth.

## Key elements

- **`x-error-codes`** (top-level) — 10 module-specific error codes (`PAYMENT_DECLINED`, `PAYMENT_IN_FLIGHT`, `PAYMENT_DISPUTED`, `PAYMENT_REFUND_EXCEEDS_REMAINING`, etc.), each mapped to an HTTP status and a human-readable description. Referenced inline via `x-error-codes` on individual operations.
- **`x-personal-data.payments`** — The section the bundler injects into `POST /account/export`. Removing this module removes the `payments` array from the export.
- **`GET /payments/methods`** (`listPaymentMethods`) — Public, no auth. Returns which payment methods (`card`, `bank_transfer`) are configured in this deployment. Empty list means checkout is disabled.
- **`GET /payments`** (`listPayments`) — Staff listing with rich filters (displayStatus, method, provider, date ranges, amount range, dispute state, RF transfer reference). Requires `bearerAuth` + `display:Payment` role. Returns `PaymentsResponse` rows with `actions` and provider refs that are never exposed on payer-facing routes.
- **`POST /payments`** (`createPayment`) — Creates or refreshes a payment intent for a pending order. 201 = new intent, 200 = refreshed existing intent (idempotent by order). Rate-limited via `paymentIntentLimiter` (shared budget with `POST /payments/{id}/sync`). 429 on budget exhaustion.
- **`POST /payments/search`** (`searchPayments`) — Alias of `listPayments` with filters in a JSON body (DTO-friendly for clients that can't encode long query strings).
- **`tags[0]`** — Single tag `Payments` with `x-family: Buying`; used for operation grouping in generated docs.
- References shared params/schemas from `../../../shared/contracts/openapi.root.yaml` (pagination, `Id`, `NonNegativeDecimalAmount`, standard 401/403/422 responses, `Location` header).

## Relationships

- **`src/modules/payments/authorization.yaml`** — Defines the `bearerAuth` security scheme that every non-public operation in this file references. Without it the `security` blocks here would be unresolvable.
- **`src/modules/payments/module.yaml`** — The module registration file that the bundler reads to discover this `openapi.yaml`, pull in the `x-personal-data` section into the global export, and wire the `x-family` tag into the site-wide navigation.

## Notes

- `POST /payments` deliberately avoids `Idempotency-Key`: the one-payment-per-order invariant is enforced in the database, and a retry simply refreshes the existing intent and returns 200 with the same `clientSecret`. The 200 vs 201 distinction follows RFC 9110 §15.3.2 (created vs. no-new-resource).
- `GET /payments` carries `x-cache: private-no-cache` to prevent any intermediary from caching a staff data list.
- The `transferReference` filter normalises the RF creditor reference (spaces, case) before matching; an invalid RF code yields an empty page, not an error.
- `POST /payments/search` is marked `x-alias-of: listPayments` — it exists solely for clients that prefer a JSON body over a long query string; the server logic is identical.
- The file is truncated in the content provided; additional paths (confirm, refund, sync, dispute) and `components/schemas` definitions almost certainly follow but are not visible here.
