---
source: src/modules/payments/domain/display-status.ts
sha256: b6b566b772d2d30ad00488d190e6531b6eb5155e33356132d0b1c88a7199b18f
generated_at: 2026-10-29T05:04:35.482955+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/domain/display-status.ts

## Purpose

Computes the human-facing display label for a payment (Shopify's `displayFinancialStatus`) from its stored status and refund records, and provides the inverse MongoDB query for each label. The two must agree: the integration suite verifies every label in both directions.

## Key elements

- **`DisplayStatusInput`** — interface defining the slice of payment data the label function reads (status, amounts, currency, refund records).
- **`displayStatusOf(input)`** — returns a `PaymentDisplayStatus` label. An open refund always wins over the stored status; otherwise the label is derived from status + refund settlement + amount comparison.
- **`displayStatusFilter(label)`** — returns the pre-built Mongo filter for a given label (the inverse of `displayStatusOf`).
- **`FILTERS`** (module-private) — `Record<PaymentDisplayStatus, Record<string, unknown>>` holding all eight label→query pairs.
- **`HAS_OPEN_REFUND` / `SETTLED_REFUND` / `NO_OPEN_REFUND`** (module-private) — reusable query fragments composed into the `FILTERS` entries.

## Relationships

- **`./lifecycle`** — imports `OPEN_REFUND_STATUSES` and `isOpenRefund` to determine whether a refund is still in-flight.
- **`@domain-primitives/money`** — imports `toMinorUnits` to compare refunded vs. total amounts in a currency-safe way.
- **`@types`** — imports `PaymentDisplayStatus`, `RefundFailureReason`, `RefundStatus`, `PaymentStatus` enums/types.
- **`domain/index.ts`** — barrel re-exports this module's public API.
- **`presenter.ts` / `providers/index.ts` / `services/list.ts`** — downstream consumers that call `displayStatusOf` (to render a label) or `displayStatusFilter` (to query by label).
- **`tests/unit/display-status.test.ts`** — unit tests for both the label computation and the filter output.

## Notes

- **Label ↔ filter parity is a contract.** They are co-maintained in this file specifically so both directions stay in sync; the integration suite cross-checks them.
- **`amountRefunded` counts a refund the moment it is opened.** The "fully refunded" branch (`amountRefunded >= amount`) is only evaluated after confirming no refund is still open; otherwise a merely *requested* refund would read as complete.
- **A refunded payment's stored `status` remains `'succeeded'`.** The display label differentiates refunded / partially-refunded / succeeded purely via the refund records and amount comparison.
- **Canceled refunds are not "open."** The `HAS_OPEN_REFUND` query explicitly excludes refunds whose `failureReason` is `RefundFailureReason.canceled`, and `isOpenRefund` in `lifecycle` applies the same rule in the in-memory path.
- **`succeeded` label means "no settled refund, no open refund."** A payment whose only refunds were canceled reads as `succeeded`, identical to one that was never refunded.
