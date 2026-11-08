---
source: src/modules/payments/presenter.ts
sha256: f0c8c4c1fb39fe640027e80973dcbf8248f679f5443301be38ca519d5f90e1f2
generated_at: 2026-11-08T07:23:03.184616+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/presenter.ts

## Purpose
Single transformation point from the stored `PaymentDocument` to the `Payment` wire contract. Every write endpoint (confirm, offline, refund, sync, intent) returns the result of `presentPayment` alone; `services/view.ts` layers `actions` on top for reads. Encodes the two-audience split: the default payer view and a staff view that re-exposes provider IDs and refund failure reasons the serializer always strips.

## Key elements
- **`presentPayment(document, staff?)`** — Main export. Serialises the document via `.toJSON()`, computes `displayStatus` and optional `nextAction`, annotates refunds with `owedAnotherWay`, and (when `staff` is true) merges `disputes` and `StaffFields` back in.
- **`nextActionOf(document)`** — Returns a `PaymentNextAction` for a bank-transfer payment in `requires_action` state. Reads beneficiary/IBAN/BIC live from config (not from the document); returns `undefined` when the buyer has nothing to do.
- **`staffFieldsOf(raw)`** — Extracts the staff-only slice (`providerRef`, per-refund `providerRefundRef` / `failureReason`) from a stored payment.
- **`withStaffFields(wire, staff)`** — Spreads staff fields into a serialised `Payment`, aligning refund extras by index.
- **`StaffFields`** (exported interface) — Shape of the staff-only data; `refunds` is a `Pick` over `RefundRecord`.

## Relationships
- **`src/types/index.ts`** — Imports the `Payment`, `PaymentNextAction`, and `Refund` wire types that define the output contract.
- **`src/modules/payments/config.ts`** — Reads `bankTransferBeneficiary`, `bankTransferIbanFriendly`, `bankTransferBic` at presentation time so config changes propagate to open transfers.
- **`src/modules/payments/domain/index.ts`** (barrel → `display-status.ts`, `lifecycle.ts`) — Calls `displayStatusOf` for the status label and `owesBuyerAnotherWay` to decide whether a refund is annotated with `owedAnotherWay: true`.
- **`src/modules/payments/model.ts`** — Imports the stored shapes `PaymentDocument` and `RefundRecord`; the document's `.toJSON()` method performs the `_id`→`id` / date→ISO conversion.
- **`src/modules/payments/services/view.ts`** — Consumes `presentPayment` and extends the result with `actions` for read endpoints.
- **`src/modules/payments/tests/integration/*.test.ts`** — Canceled, refunds, and transfer integration tests exercise `presentPayment` against real document fixtures.

## Notes
- The `.toJSON()` result is cast to `Omit<Payment, 'displayStatus' | 'nextAction'>` because the compiler cannot see through the document's transform; the two omitted fields are added manually.
- `disputes` is destructured out before the wire object is built (so the payer never sees it), then conditionally re-spread only when `staff` is true **and** the array is non-empty.
- Bank-transfer next-action fields (beneficiary, IBAN, BIC) are intentionally **not** frozen on the payment document; a config change is visible on every still-open transfer without a data migration.
- `staff` is a boolean flag on a single function rather than a separate entry point, keeping the "one place a document becomes a Payment" invariant.
