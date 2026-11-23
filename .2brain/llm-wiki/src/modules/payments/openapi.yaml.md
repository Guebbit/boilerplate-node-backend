---
source: src/modules/payments/openapi.yaml
source_sha256: 710643538c02300c82d5fea1d7d1e3e370c191c0ed9b4cf5084ab1c816b141d2
context_sha256: 0886c04a217c57a1511b6353a84a281692d5f92303ed3d1fb8f713eedcb2cd0f
generated_at: 2026-11-22T06:46:43.179091+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/openapi.yaml

## Purpose
OpenAPI 3.1.0 contract for the payments module ("payments — module contract", version `0.1.0`). It declares the module's HTTP operations, schemas, error codes and its slice of the account data export, so the bundler can merge it into the shared API contract. Payments cover payment intents, confirmation, offline payments and refunds.

## Key elements
- **`tags`**: a single `Payments` tag (`x-family: Buying`) that all of the module's operations file themselves under.
- **`x-error-codes`** (top level): the module's error catalogue, each entry with an HTTP status and description.
  - Mostly 409s: `PAYMENT_DECLINED`, `PAYMENT_IN_FLIGHT`, `PAYMENT_NOT_CONFIRMABLE`, `PAYMENT_NOT_REFUNDABLE`, `PAYMENT_DISPUTED`, `PAYMENT_ORDER_NOT_PAYABLE`, `PAYMENT_REFUND_NOT_OPEN`, `PAYMENT_REFUND_IN_FLIGHT`, `PAYMENT_CARD_NOT_AVAILABLE`.
  - `PAYMENT_REFUND_EXCEEDS_REMAINING` is a 422.
- **`x-personal-data.payments`**: an array of `ExportPayment` that becomes this module's section of `POST /account/export` (`AccountExportResponse`). Removing the module removes the section.
- **`GET /payments/methods`** (`listPaymentMethods`): public (`security: []`), cached `max-age: 60`. Lists the methods the deployment offers. `card` appears only if a card provider is configured, and `bank_transfer` only once its beneficiary and IBAN are configured. The list can be empty, which turns checkout off.
- **`GET /payments`** (`listPayments`): staff list, newest first, requiring the `display:Payment` scope and cached `private-no-cache`.
  - Paging and sorting use the shared `PageParam`/`PageSizeParam` and `PaymentSort`.
  - Filters are `displayStatus`, `method`, `provider`, `createdFrom`/`createdTo`, `receivedFrom`/`receivedTo` (offline payments), `amountMin`/`amountMax`, `orderId`, `disputed`, `reference` and `transferReference` (an RF creditor reference, normalised for spaces and case).
  - Each row carries the order's `orderNumber` and `email`, plus per-caller `actions`.
  - Provider references and a failed refund's `failureReason` are exposed here only.
- **`POST /payments`** (`createPayment`): requires the `checkout:Cart` scope. Freezes one of the caller's `pending` orders into a payment intent, taking the amount from the order's lines.
  - It returns 201 for a new intent and 200 when it refreshes the existing one (one payment per order).
  - It documents 409s (`PAYMENT_CARD_NOT_AVAILABLE`, `PAYMENT_IN_FLIGHT`, `PAYMENT_ORDER_NOT_PAYABLE`), `REAUTH_REQUIRED` on 401, and a 429 from a shared hourly budget.
- **`POST /payments/search`** (`searchPayments`): JSON-body variant of `GET /payments` (`x-alias-of: listPayments`), using `SearchPaymentsRequest`.
- **Referenced schemas** (defined under `#/components/schemas`): `PaymentMethodsResponse`, `PaymentsResponse`, `Payment`, `CreatePaymentRequest`, `SearchPaymentsRequest`, `PaymentSort`, `PaymentDisplayStatus`, `PaymentMethodKind`, `ExportPayment`.

## Relationships
- **`authorization.yaml`**: the operations here use `bearerAuth` scopes such as `display:Payment` and `checkout:Cart`. These are presumably defined there, but the visible content does not show it.
- **`asyncapi.webhooks.yaml`**: no direct reference appears in the visible portion of this file.

## Notes
- `POST /payments` deliberately needs no `Idempotency-Key`. A retry refreshes the same intent, and a stored replay would hand back the first answer's `clientSecret`.
- `POST /payments` and `POST /payments/{id}/sync` share a single hourly rate-limit budget per account (`paymentIntentLimiter`).
- Staff list rows return `actions.pay` as false. Paying is the payer's own step, and payers read their payments through `GET /orders/{id}/payments`.
- A `transferReference` that is not a valid RF code returns an empty page rather than an error.
- Operation-level `x-error-codes` lists which of the module's codes each operation can return.
- Common parameters, schemas (`Id`, `NonNegativeDecimalAmount`), the `Location` header and the standard error responses are `$ref`'d from the shared `openapi.root.yaml` under `shared/contracts`.
