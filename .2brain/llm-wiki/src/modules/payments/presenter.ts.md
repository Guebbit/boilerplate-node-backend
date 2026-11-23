---
source: src/modules/payments/presenter.ts
generated_at: 2026-11-22T06:47:04.159980+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/presenter.ts

## Purpose
Turns a stored payment document into the `Payment` wire contract. It is the single place this conversion happens: every write endpoint (confirm, offline, refund, sync, intent) answers with this output alone, and `withActions` in the payments `services/view.ts` builds on it for reads that also need `actions`. It serves two audiences: the payer (default) and staff, who additionally see provider ids and failed-refund reasons.

## Key elements
- **`presentPayment(document, staff = false)`** (exported): Calls `document.toJSON()` and casts the result to the wire shape. Then it:
  - marks refunds with `owedAnotherWay: true` where `owesBuyerAnotherWay` says so;
  - adds `displayStatus` from `displayStatusOf`;
  - adds `nextAction` when there is one.
  
  If `staff` is true, it also includes `disputes` (only when non-empty) and the staff-only fields. For payers, `disputes` is stripped.
- **`nextActionOf(document)`** (internal): Returns bank-transfer instructions (`type: 'bank_transfer'`, beneficiary, IBAN, optional BIC, reference, `payBy` as an ISO string). It returns this only when the method is `bank_transfer`, the status is `requires_action`, the payment has `transferReference` and `payBy`, and the deployment config supplies a beneficiary and IBAN. Otherwise it returns `undefined`.
- **`staffFieldsOf(raw)`** (internal): Extracts `providerRef` and, per refund, `providerRefundRef`, `failureReason` and `paidOutside` (`method` plus optional `reference`). It copies these field by field.
- **`withStaffFields(wire, staff)`** (internal): Merges the staff fields into the wire payment. Refunds are matched to the staff fields by array index.

## Relationships
- `./config`: `bankTransferBeneficiary`, `bankTransferBic` and `bankTransferIbanFriendly` are read live on each call, not stored on the payment.
- `./domain` (`display-status.ts`, `lifecycle.ts`, exposed via `index.ts`): supplies `displayStatusOf` and `owesBuyerAnotherWay`.
- `./model`: provides the `PaymentDocument` and `RefundRecord` types and the `toJSON` transform that the presenter relies on.
- `@types` (`src/types/index.ts`): provides the `Payment`, `PaymentNextAction` and `Refund` contract types.
- `src/modules/payments/services/view.ts`: builds `withActions` on top of this presenter.
- The integration tests (`canceled`, `refunds`, `transfer`) exercise payment output; their specifics are not visible here.

## Notes
- Bank transfer details are deliberately not frozen on the payment. A config change shows on every still-open transfer. If the deployment stops offering transfers, `nextAction` is omitted.
- Staff and payer refund arrays are aligned by index. `withStaffFields` and the `owedAnotherWay` mapping both assume `document.refunds` and the serialized `refunds` have the same order.
- The `toJSON() as Omit<Payment, ...>` cast is intentional. The stored document is typed as stored, not as the wire shape.
- `paidOutside` is copied field by field because the stored value is a subdocument, and spreading it would carry its internals.
