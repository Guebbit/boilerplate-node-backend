---
source: src/modules/payments/domain/display-status.ts
source_sha256: c9229cae4fe0a7f9325eaa8942328596d7ede26abfb0194bf17a2e610622e6b1
context_sha256: aaa3df9a60790b5dfaf53d32cf21177e75f9b9e1b3047620ab21f028609c9acc
generated_at: 2026-11-22T06:43:13.638254+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/domain/display-status.ts

## Purpose
Derives the label a payment shows (Shopify's `displayFinancialStatus`) from its stored status and refund records. It also provides the matching stored-field Mongo query for each label. The two live side by side because they must agree. The integration suite checks every label both ways.

## Key elements
- `DisplayStatusInput`: the slice of a payment the label reads (`status`, `amount`, `amountRefunded`, `currency`, and `refunds` with `status` and optional `failureReason`).
- `displayStatusOf(input)`: returns a `PaymentDisplayStatus`. The rules are applied in this order:
  1. Any open refund gives `refund_pending`.
  2. A `succeeded` status with no succeeded refund gives `succeeded`.
  3. A `succeeded` status with a succeeded refund gives `refunded` if `amountRefunded >= amount` in minor units, otherwise `partially_refunded`.
  4. `processing` gives `pending`.
  5. `canceled` gives `canceled`.
  6. `declined` gives `failed`.
  7. Anything else gives `incomplete`.
- `displayStatusFilter(label)`: returns the Mongo filter over payments for one label, looked up in the internal `FILTERS` map.
- Internal pieces: `HAS_OPEN_REFUND`, `SETTLED_REFUND`, `NO_OPEN_REFUND` and `FILTERS`. `FILTERS` is a `Record<PaymentDisplayStatus, …>`, so it covers every label.

## Relationships
- `lifecycle.ts`: supplies `OPEN_REFUND_STATUSES` (used in the Mongo filter) and `isOpenRefund` (used in `displayStatusOf`).
- `src/domain-primitives/money.ts`: `toMinorUnits` compares `amountRefunded` with `amount` in the payment's currency.
- `src/types/index.ts`: supplies `PaymentDisplayStatus`, `RefundStatus`, `RefundFailureReason` and `PaymentStatus`.
- `src/modules/payments/domain/index.ts` is a neighbor in the dependency graph.
- `src/modules/payments/presenter.ts`, `src/modules/payments/services/list.ts` and `src/modules/payments/providers/index.ts` are graph neighbors. The file content does not show how they use this module.
- Tests: `src/modules/payments/tests/unit/display-status.test.ts` and `tests/integration/concurrency/payment-races.test.ts`.

## Notes
- `amountRefunded` counts a refund as soon as it is opened. The code therefore reads it only when no refund is open. In that case, `amountRefunded` equal to `amount` means everything went back. The stored status does not say this, because a refunded payment stays `succeeded`.
- An open refund overrides the stored status in every label. Each non-`refund_pending` filter includes `NO_OPEN_REFUND` to match.
- A refund with `failureReason` of `canceled` does not count as open in the filter (`HAS_OPEN_REFUND`). A payment whose only refunds were canceled reads the same as one never refunded.
- `displayStatusOf` compares amounts via `toMinorUnits`. The filters compare the stored `amountRefunded` and `amount` fields directly with `$expr` (`$gte` / `$lt`).
- Any change to `displayStatusOf` must be mirrored in `FILTERS`, and the reverse.
