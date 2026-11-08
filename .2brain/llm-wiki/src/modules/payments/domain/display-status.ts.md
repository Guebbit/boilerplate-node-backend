---
source: src/modules/payments/domain/display-status.ts
sha256: 43032cded51ae699660b8afdec7d38a54f5d2669eab0e36023001ce3001f1631
generated_at: 2026-11-08T07:19:26.939699+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/domain/display-status.ts

## Purpose

Derives the Shopify `displayFinancialStatus` label for a payment from its stored status and refund records, and provides the inverse: a Mongo query that selects payments by that label. The label function and the filter are written side-by-side in this file because they must stay in agreement — the integration suite verifies every label both ways.

## Key elements

- **`DisplayStatusInput`** — interface describing the slice of a payment the label function reads (status, amount, amountRefunded, currency, refunds array).
- **`displayStatusOf(input)`** — computes the `PaymentDisplayStatus` label. An open refund always wins over the stored status; otherwise the label falls through `succeeded` / `processing` / `canceled` / `declined` / other.
- **`displayStatusFilter(label)`** — returns the pre-built Mongo filter (`FILTERS[label]`) for querying payments by a given display status.
- **`FILTERS`** (module-private) — `Record<PaymentDisplayStatus, Record<string, unknown>>` mapping each label to its stored-field query. The `refunded` vs `partially_refunded` distinction is made by comparing `$amountRefunded` to `$amount` via `$expr`.

## Relationships

- **`./lifecycle`** — imports `OPEN_REFUND_STATUSES` and `isOpenRefund` to detect an in-flight refund.
- **`@domain-primitives/money`** — imports `toMinorUnits` to compare amounts in minor units (avoids string comparison).
- **`@types`** — imports `PaymentDisplayStatus`, `RefundFailureReason`, `RefundStatus`, `PaymentStatus`.
- **`./index.ts`** — barrel re-export; consumers import from the domain index rather than this file directly.
- **`/tests/unit/display-status.test.ts`** — unit tests for both `displayStatusOf` and `displayStatusFilter`.
- **`/services/list.ts`** — consumes `displayStatusFilter` to build list queries.
- **`/presenter.ts`** — consumes `displayStatusOf` to shape payment data for the UI.

## Notes

- **`amountRefunded` is only trustworthy when no refund is open.** A refund increments this field the moment it is *requested*, so reading it while a refund is still open would overstate. `displayStatusOf` therefore only consults it after confirming no open refund exists.
- **A fully refunded payment still stores `status: 'succeeded'`.** The display label (`refunded` / `partially_refunded`) is the only place the distinction is made; don't rely on the stored status for that.
- **The `succeeded` filter excludes both open *and* settled refunds.** A payment whose only refunds were canceled is indistinguishable from one that was never refunded — both read as `succeeded`.
- **`FILTERS` and `displayStatusOf` must be kept in sync manually.** There is no code generation or test-enforced equivalence beyond the integration suite; adding a new label requires updating both the branch in `displayStatusOf` and the corresponding `FILTERS` entry.
