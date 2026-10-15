---
source: src/modules/payments/openapi.yaml
sha256: 6b53877971cba4f6aa3762e154d9c480ce0bf394f0046e265b9dd5d0b0756779
generated_at: 2026-10-15T11:26:52.833153+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/openapi.yaml

## Purpose

OpenAPI 3.1.0 module contract for the payments domain. It declares every HTTP endpoint the payments module exposes (method listing, payment/refund queries, the attention queue, intent creation), the module-specific error vocabulary, and the `payments` slice of the account data export. A bundler merges this file into the shop's root OpenAPI document; removing the module removes its paths and export section.

## Key elements

- **`x-error-codes`** — Seven module-scoped error codes (`PAYMENT_DECLINED`, `PAYMENT_IN_FLIGHT`, `PAYMENT_NOT_CONFIRMABLE`, `PAYMENT_NOT_REFUNDABLE`, `PAYMENT_REFUND_EXCEEDS_REMAINING`, `PAYMENT_ORDER_NOT_PAYABLE`, `PAYMENT_CARD_NOT_AVAILABLE`) with HTTP status and human description.
- **`x-personal-data`** — Defines the `payments` array (items: `ExportPayment`) that the bundler injects into `POST /account/export`.
- **`GET /payments/methods`** — Public, no auth. Returns which payment methods (`card`, `bank_transfer`) are configured for this deployment; empty list means checkout is off.
- **`GET /payments`** — Staff listing (`payments.any.read`). Supports pagination, sort, `displayStatus`, `method`, `provider`, date/amount range, `orderId`, `reference` filters. Exposes provider refs and failed-refund reasons not available to payers.
- **`POST /payments/search`** — Body-variant of the above; tagged `x-alias-of: listPayments`.
- **`GET /payments/refunds`** — Staff refund listing across all payments; read-only (mutations go through the refund/cancel write path).
- **`GET /payments/attention`** — Staff queue of unresolved payment problems (stuck refunds, manual refunds owed, stock-commit owed, post-cancel refund owed). Oldest-first, 100-row cap per source. Amount mismatches are excluded (they live in audit, not stored state).
- **`POST /payments/intent`** *(truncated in source)* — Creates or refreshes a payment intent for a `pending` order. Idempotent by design (no `Idempotency-Key` needed); 201 = created, 200 = refreshed. Rate-limited per caller (429).

## Relationships

- **`shared/contracts/openapi.root.yaml`** — `$ref` targets for shared parameters (`PageParam`, `PageSizeParam`), the `Id` schema, and standard error responses (`InternalError`, `Unauthorized`, `Forbidden`, `ValidationError`). This file contributes nothing to the root; it only consumes from it.

## Notes

- `security: []` on `GET /payments/methods` is intentional — it is pre-purchase public information, mirroring `GET /delivery/methods`.
- `x-alias-of` is a custom extension (not standard OpenAPI) used to signal that `searchPayments` and `listPayments` share one handler.
- The attention endpoint deliberately excludes amount mismatches; do not add them there — they are audit rows (`payment.amount_mismatch`), not document state.
- The file content shown is truncated; the `POST /payments/intent` description and any subsequent paths/schemas are not visible in this excerpt.
