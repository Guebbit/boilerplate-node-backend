---
source: src/modules/payments/domain/display-status.ts
sha256: 5501babb1b2a0e764977f3bd5b14f5035c163bad018590d21059066f5b348e2e
generated_at: 2026-10-15T11:24:56.874151+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/domain/display-status.ts

## Purpose

Derives the Shopify `displayFinancialStatus` label from a payment's stored status, refund records, and monetary amounts, and provides the inverse: a MongoDB query that selects payments matching a given label. The label function and its filter are written side-by-side because an integration suite asserts they agree in both directions.

## Key elements

- **`DisplayStatusInput`** – Minimal read-model (status, amount, amountRefunded, currency, refunds array) needed to compute a label.
- **`displayStatusOf(payment: DisplayStatusInput): PaymentDisplayStatus`** – The label function. Priority order: open refund → `refund_pending`; otherwise dispatches on stored `status` (succeeded, processing, cancelled, declined, everything-else) and, for `succeeded`, distinguishes fully vs. partially refunded by comparing `amountRefunded` to `amount` in minor units.
- **`displayStatusFilter(label: PaymentDisplayStatus): Record<string, unknown>`** – Returns the pre-built Mongo filter for a label. Backed by the module-private `FILTERS` record.
- **`HAS_OPEN_REFUND`, `SETTLED_REFUND`, `NO_OPEN_REFUND`** – Reusable Mongo query fragments (not exported) used to compose the `FILTERS` entries.
- **`FILTERS`** – Module-private `Record<PaymentDisplayStatus, …>` mapping every label to its stored-field query.

## Relationships

- **`./lifecycle.ts`** – Imports `OPEN_REFUND_STATUSES`; the set of refund statuses considered "open" is defined there and consumed by both the label function and the filters.
- **`@types` (src/types/index.ts)** – Source of the `PaymentStatus`, `RefundStatus`, and `PaymentDisplayStatus` enums/types used throughout.
- **`@shared-kernel/money.ts`** – Imports `toMinorUnits` so amount comparisons in `displayStatusOf` are currency-aware.
- **`src/modules/payments/domain/index.ts`** – Barrel file; re-exports this module's public surface for other domain consumers.
- **`src/modules/payments/presenter.ts`** – Call-site for `displayStatusOf` when shaping a payment for the UI.
- **`src/modules/payments/services/list.ts`** – Call-site for `displayStatusFilter` when building the Mongo query behind the payments list endpoint.
- **`src/modules/payments/tests/unit/display-status.test.ts`** – Unit tests covering `displayStatusOf` (and, per the file's docblock, the agreement between label and filter is checked by a separate integration suite).

## Notes

- **`amountRefunded` is not settlement-aware.** It increments the moment a refund is *opened*, so it can equal `amount` even while a refund is still pending. The code therefore guards with `NO_OPEN_REFUND` before comparing the two amounts.
- **A fully refunded payment keeps stored status `succeeded`.** The "refunded" vs. "succeeded" distinction is purely derived; there is no stored `refunded` status.
- **The `succeeded` filter uses `refunds: { $size: 0 }`** (no refund documents at all), whereas every other status filter uses `NO_OPEN_REFUND` (no *open* refund). This mirrors the label logic: a payment with settled refunds is never "succeeded."
- **`incomplete` covers two stored statuses** (`requires_confirmation`, `requires_action`); it is the catch-all for any non-`declined` status that isn't explicitly handled.
- **Label ↔ filter parity is a contractual invariant.** Adding a new branch to `displayStatusOf` without updating `FILTERS` (or vice-versa) will break the integration suite that cross-checks every label both ways.
