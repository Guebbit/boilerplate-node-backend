---
source: src/modules/payments/presenter.ts
sha256: f0c8c4c1fb39fe640027e80973dcbf8248f679f5443301be38ca519d5f90e1f2
generated_at: 2026-10-29T05:07:44.649245+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/presenter.ts

## Purpose

Transforms a stored `PaymentDocument` into the wire `Payment` contract that every write endpoint returns. It also produces an optional staff view that adds provider identifiers (`providerRef`, `providerRefundRef`) and refund `failureReason` fields stripped from the payer-facing shape. `services/view.ts`'s `withActions` layers `actions` on top of this for read endpoints that need them.

## Key elements

- **`presentPayment(document, staff?)`** — the single export. Builds the payer view (serialised doc + `displayStatus` + optional `nextAction` + refund `owedAnotherWay` flags) and, when `staff` is true, merges in provider refs and re-attaches `disputes` if present.
- **`StaffFields`** (exported interface) — the narrow shape of staff-only stored fields (`providerRef`, per-refund `providerRefundRef` / `failureReason`).
- **`staffFieldsOf`** (internal) — reads those fields off the raw document.
- **`withStaffFields`** (internal) — spreads staff fields onto the already-built wire `Payment`.
- **`nextActionOf`** (internal) — returns a `bank_transfer` `PaymentNextAction` (beneficiary, IBAN, BIC, reference, deadline) only when the payment is in `requires_action` with an open transfer; otherwise `undefined`.

## Relationships

- **`./config`** — reads live deployment values (`bankTransferBeneficiary`, `bankTransferIbanFriendly`, `bankTransferBic`) so an open transfer always reflects current settings.
- **`./domain`** (`display-status.ts`, `lifecycle.ts`) — `displayStatusOf` supplies the human-readable status; `owesBuyerAnotherWay` flags refunds that will be settled outside this payment.
- **`./model`** — provides the stored types `PaymentDocument` and `RefundRecord` that the presenter accepts.
- **`@types`** (`src/types/index.ts`) — the wire contract types `Payment`, `PaymentNextAction`, `Refund` that the output must satisfy.
- **`services/view.ts`** — consumes `presentPayment` as its base serializer, adding `actions` for read endpoints.
- **Integration tests** (`cancelled.test.ts`, `refunds.test.ts`, `transfer.test.ts`) — exercise the presenter's output shape across those payment lifecycles.

## Notes

- `document.toJSON()` handles the `_id → id` and date-to-ISO transforms; the result is cast because the compiler can't infer the narrowing through `toJSON()`.
- `disputes` are deliberately excluded from the payer view and omitted entirely when empty; they appear only in the staff view and only when non-empty.
- Bank-transfer details (beneficiary, IBAN, BIC) are **not** frozen on the payment row — they are read from config at present time, so a config change propagates to every transfer still in `requires_action`.
- The `nextAction` field is omitted (not set to `null`) when the buyer has nothing to do; consumers must treat its absence as "no pending action."
