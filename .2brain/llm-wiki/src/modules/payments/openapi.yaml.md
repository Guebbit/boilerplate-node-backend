---
source: src/modules/payments/openapi.yaml
sha256: 324038d5edb393b70fc04f1d56612b8e230ee32b8ec51bc6c3938b624c4d889f
generated_at: 2026-11-14T21:02:10.238646+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **payments** module. It declares the HTTP surface for listing payment methods, creating payment intents, listing and searching payments, and defines the module's shared error codes and the payments section of the account data export. It exists so that clients, staff tooling, and the account-export bundler all consume a single, versioned description of what the payments module exposes.

## Key elements

- **`tags[0]`** — `Payments` tag, annotated with `x-family: Buying`, grouping all operations in this file.
- **`x-error-codes`** — Module-level catalogue of error codes (`PAYMENT_DECLINED`, `PAYMENT_IN_FLIGHT`, `PAYMENT_NOT_CONFIRMABLE`, `PAYMENT_NOT_REFUNDABLE`, `PAYMENT_DISPUTED`, `PAYMENT_REFUND_EXCEEDS_REMAINING`, `PAYMENT_ORDER_NOT_PAYABLE`, `PAYMENT_REFUND_NOT_OPEN`, `PAYMENT_REFUND_IN_FLIGHT`, `PAYMENT_CARD_NOT_AVAILABLE`) with their HTTP status and human-readable description. Individual operations reference subsets via their own `x-error-codes`.
- **`x-personal-data.payments`** — Schema fragment the account-export bundler splices into `AccountExportResponse`; the `ExportPayment` array is included automatically when the module is present.
- **`GET /payments/methods`** (`listPaymentMethods`) — Public, unauthenticated endpoint returning which payment methods (`card`, `bank_transfer`) are configured for the deployment.
- **`GET /payments`** (`listPayments`) — Staff-listed, paged, filterable listing of all payments. Requires `display:Payment`. Supports filters for sort, `displayStatus`, method, provider, date ranges, amount range, order ID, dispute status, reference, and `transferReference` (RF creditor reference, space/case-tolerant).
- **`POST /payments`** (`createPayment`) — Creates (or refreshes) a payment intent for the caller's `pending` order. Returns **201** for a new intent, **200** for a refresh. Requires `checkout:Cart`. Rate-limited (429) sharing a per-account budget with `POST /payments/{id}/sync`.
- **`POST /payments/search`** (`searchPayments`) — DTO-friendly alias (`x-alias-of: listPayments`) of the staff listing with filters in a JSON body.
- **Shared references** — Pulls parameters (`PageParam`, `PageSizeParam`), schemas (`NonNegativeDecimalAmount`, `Id`), responses (`Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `ValidationError`, `TooManyRequests`), and headers (`Location`) from `shared/contracts/openapi.root.yaml`.

## Relationships

- **`src/modules/payments/authorization.yaml`** — Sibling contract file in the same module; handles the confirmation, sync, and refund operations that follow the intent created here. This file's `Payment` schema and error codes are consumed by that file's endpoints.
- **`src/modules/payments/module.yaml`** — Module registration file; lists this `openapi.yaml` (and `authorization.yaml`) as the contract documents the bundler assembles into the combined API spec. Removing the module removes both contracts and the `x-personal-data` export section.

## Notes

- The file is truncated in the source provided; additional paths (likely confirmation, sync, refund endpoints) are expected further down but are defined or referenced in `authorization.yaml`.
- `POST /payments` is idempotent-by-design: re-calling returns 200 with the existing intent rather than requiring an `Idempotency-Key`. The 201 vs 200 distinction is the only signal for "created" vs "refreshed".
- `GET /payments` carries `x-cache: private-no-cache`; staff responses must not be cached by intermediaries.
- The `transferReference` filter matches RF creditor references case- and space-insensitively but returns an empty list (not an error) for invalid codes — clients should not surface a "close match" hint.
- `x-alias-of` on `searchPayments` is a custom annotation indicating it is functionally identical to `listPayments`; implementations should treat them as the same operation.
