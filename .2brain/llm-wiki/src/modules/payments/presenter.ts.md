---
source: src/modules/payments/presenter.ts
sha256: 43690acaeb79cb83edd344927550ac6b48fa79370675d95a482618e6307cc56b
generated_at: 2026-11-14T21:02:37.679467+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/presenter.ts

## Purpose

The single presentation boundary that turns a stored `PaymentDocument` into the `Payment` wire contract. Every write endpoint (confirm, offline, refund, sync, intent) serialises its response through this file. It produces two views: the payer's default view and a staff view that additionally exposes provider IDs and refund failure reasons — fields the payer-facing serializer always strips.

## Key elements

- **`presentPayment(document, staff?)`** — the sole export. Takes a stored `PaymentDocument`, computes `displayStatus` and (when applicable) `nextAction`, marks refunds owed another way, and returns a `Payment`. When `staff` is true, also injects provider refs, per-refund failure reasons, and the disputes array (if non-empty).
- **`nextActionOf(document)`** — returns the buyer's pending `PaymentNextAction` (bank-transfer beneficiary, IBAN, BIC, reference, deadline) or `undefined`. Reads beneficiary/IBAN/BIC **live** from deployment config; reference and deadline come from the document.
- **`staffFieldsOf(raw)`** — extracts the staff-only slice (`providerRef`, per-refund `providerRefundRef` / `failureReason`) from the stored row.
- **`withStaffFields(wire, staff)`** — merges those staff fields onto an already-serialised `Payment`.
- **`StaffFields`** (interface) — shape of the staff-only additions.

## Relationships

- **`src/types/index.ts`** — imports the `Payment`, `PaymentNextAction`, and `Refund` wire types that define the output contract.
- **`src/modules/payments/config.ts`** — calls `bankTransferBeneficiary`, `bankTransferBic`, `bankTransferIbanFriendly` to populate `nextAction` from the current deployment config.
- **`src/modules/payments/domain/display-status.ts`** (via `./domain`) — calls `displayStatusOf` to derive the buyer-facing status label.
- **`src/modules/payments/domain/lifecycle.ts`** (via `./domain`) — calls `owesBuyerAnotherWay` to flag refunds the buyer will be asked to receive by another method.
- **`src/modules/payments/model.ts`** — imports the `PaymentDocument` and `RefundRecord` stored-shape types.
- **`src/modules/payments/services/view.ts`** — downstream consumer; its `withActions` wraps this presenter's output to add `actions` for read endpoints.

## Notes

- `document.toJSON()` performs the `_id` → `id` rename and date-to-ISO-string transform; the result is cast to the wire shape because the compiler cannot see through the generic `toJSON`.
- Beneficiary, IBAN, and BIC are **not** frozen on the document — they are re-read from config on every presentation, so a config change immediately affects all still-open transfers. A deployment that has since removed bank transfers simply yields `undefined` for `nextAction`.
- `disputes` is fully omitted from the payer view and included in the staff view only when the array is non-empty.
- `owesBuyerAnotherWay` lets the payer see only a boolean `owedAnotherWay` flag on the refund; the actual alternative channel details remain staff-visible.
