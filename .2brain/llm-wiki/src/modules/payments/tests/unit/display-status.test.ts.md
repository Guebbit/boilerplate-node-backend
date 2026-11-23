---
source: src/modules/payments/tests/unit/display-status.test.ts
source_sha256: 3d1bb82d557e351bf538a91134e365768f6ed016881659d9310b5d7160a235b4
context_sha256: 84b97eb986128e4049445623f25d502a4df022dcb7c00a5991a992ecddec5195
generated_at: 2026-11-22T07:04:56.258013+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/unit/display-status.test.ts

## Purpose
Unit tests for `displayStatusOf`, the function that computes the label a payment shows. The tests focus on the refund rule: a refund that is still open wins over the stored payment status. `amountRefunded` counts a requested refund as already done, so it is read only once no refund is open.

## Key elements
- **`describe('displayStatusOf')`**: the single suite. It defines the fixtures `open` (pending refund), `failed`, `settled` (succeeded), `canceled` (failed with `RefundFailureReason.canceled`) and `base` (`amount: '50.00'`, `amountRefunded: '0.00'`, `currency: 'EUR'`).
- **Table-driven `it.each` test**: each row is `[PaymentStatus, refunds, amountRefunded, expected PaymentDisplayStatus]`. The rows cover:
  - Non-succeeded statuses: `requires_confirmation` and `requires_action` give `incomplete`, `processing` gives `pending`, `declined` gives `failed`, and `canceled` gives `canceled`.
  - `succeeded` with no refunds gives `succeeded`.
  - `succeeded` with settled refunds gives `partially_refunded` (10 of 50) or `refunded` (50 of 50). This also holds with duplicate settled refunds.
  - `succeeded` with a pending refund, or a failed one, gives `refund_pending`, even when the amount is fully refunded.
  - A canceled refund does not count as open. It gives `succeeded` on its own, and `refunded` when combined with settled refunds.
- **Minor-units test**: `amount: '0.30'` with `amountRefunded: '0.3'` and a settled refund still gives `refunded`. This shows that the amounts are compared in minor units and that unpadded text is accepted.

## Relationships
- Imports `displayStatusOf` from `@modules/payments/domain` (`src/modules/payments/domain/index.ts`), which re-exports it from `src/modules/payments/domain/display-status.ts`, the code under test.
- Imports `PaymentDisplayStatus`, `RefundFailureReason`, `RefundStatus` and the `PaymentStatus` type from `@types` (`src/types/index.ts`).

## Notes
- A `failed` refund counts as open, so it gives `refund_pending`. The exception is a `failed` refund with `failureReason: canceled` (a staff-voided refund), which is closed for good.
- `amountRefunded` is passed as a string, built with `String(amountRefunded)` in the table test.
- Refunds are passed as plain objects with `status` and an optional `failureReason`.
