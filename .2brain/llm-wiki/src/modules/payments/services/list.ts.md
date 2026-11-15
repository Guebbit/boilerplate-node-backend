---
source: src/modules/payments/services/list.ts
sha256: 248d77696a30b52769262fd0abcd47f0050abbeb31e9e969e68d3ff7650ea38c
generated_at: 2026-11-14T21:07:52.462901+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/list.ts

## Purpose

Provides the three read-side query functions behind the staff Payments page: a paginated payment list with order context, a cross-payment refund list, and a "needs attention" digest of problems that require a human. All three return `display:Payment`-shaped rows carrying provider identifiers.

## Key elements

- **`listPayments(filters, authContext?)`** — Returns one page of payments. Canonicalises a `transferReference` via `parseReference` (invalid codes short-circuit to an empty page), builds label sub-filters (`displayStatusFilter`, `openDisputeFilter`), delegates to the repository for a staff search, then batch-resolves order numbers/emails via `orderService`.
- **`listRefunds(filters)`** — Returns one page of refunds across all payments (newest first) by calling the repository's refund search and mapping each `RefundRow` through `refundRow`.
- **`listAttention()`** — Aggregates six parallel repository queries (stale refunds past a threshold, final refusals, manual refunds, reversed refunds, over-refunded payments, open disputes) and merges them into a single `PaymentAttentionItem[]`. Deduplicates over-refunded rows against the other refund buckets.
- **`staffRow(payment, order?, authContext?)`** — Internal mapper that spreads `withActions` and conditionally adds `orderNumber`/`email`.
- **`refundRow(row)`** — Internal mapper turning a `RefundRow` into a `RefundListItem` with optional fields spread in conditionally.
- **`refundAttention(row, kind)`** — Builds a `PaymentAttentionItem` from a single refund; sets `since` to `reversedAt` for reversed refunds, `createdAt` otherwise; attaches `refundDueBy`/`refundDueRule` via `dueByOf`.
- **`exceedingRows(payments)`** — Flags refunds where the running total exceeds the payment amount (kind `refund_exceeds_remaining`), reporting the overshoot via `exceedsBy`.
- **`disputeRows(payments)`** — Builds attention items for disputes in `needs_response` status, including the `alreadyRefunded` amount from `refundedForGood`.
- **`refundedForGood(payment)`** — Sums succeeded, non-reversed refund amounts on a payment.
- **`ATTENTION_LIMIT`** (100) — Cap per attention source query.

## Relationships

- **`src/modules/payments/repository.ts`** — Exports `paymentRepository` (used for all data access: staff search, refund search, open-refund queries, over-refunded and open-dispute lookups) and the `RefundFilters`/`RefundRow` types consumed here.
- **`src/modules/orders/index.ts`** — Exports `orderService`, which this file calls (`findManyByIds`) to batch-resolve order numbers and emails for the payment list.
- **`src/modules/payments/domain/index.ts`** — Re-exports the domain helpers used here: `displayStatusFilter`, `openDisputeFilter`, `parseReference`, `refundDueBy`, `exceedsBy`, `exceedsRemaining`.
- **`src/modules/payments/domain/transfer-reference.ts`** — Source of `parseReference` for canonicalising transfer-reference codes.
- **`src/modules/payments/domain/display-status.ts`** — Source of `displayStatusFilter`.
- **`src/modules/payments/domain/disputes.ts`** — Source of `openDisputeFilter` and dispute-related types.
- **`src/modules/payments/domain/lifecycle.ts`** — Source of `refundDueBy` and refund-status helpers used by the attention logic.
- **`src/domain-primitives/money.ts`** — `addMoney`, `NO_MONEY`, `padDecimal`, `toDecimalString`, `toMinorUnits` for all monetary arithmetic and formatting.
- **`src/domain-primitives/time.ts`** — `MINUTE_MS` constant for the stale-refund cutoff calculation.
- **`src/infrastructure/persistence/search.ts`** — `buildPaginatedMeta` and `normalizePagination` for pagination metadata.
- **`src/modules/payments/config.ts`** — `paymentAttentionMinutes()` determines the staleness threshold for the attention list.
- **`src/modules/payments/model.ts`** — Type definitions `PaymentDocument` and `RefundRecord` used throughout.
- **`src/modules/payments/services/index.ts`** — Re-exports this module's public functions (`listPayments`, `listRefunds`, `listAttention`) as part of the services barrel.

## Notes

- An invalid `transferReference` (unparseable code) returns an **empty page**, not an error — there is no "did you mean" feedback to staff.
- The `listAttention` function issues **six concurrent** repository queries; each is capped at `ATTENTION_LIMIT` (100). Over-refunded refund IDs are collected into a `Set` and excluded from the stale/refused/reversed buckets to avoid duplicates.
- `reversed_refund` attention rows set `since` to `reversedAt` (when the bounce happened), not `createdAt`.
- The `alreadyRefunded` field on dispute rows is only included when the total exceeds zero minor units (`NO_MONEY`).
- `staffRow` intentionally does **not** set `pay` to true — the payer's own "pay" action is excluded from the staff list row.
- `./scope` (`callerScope`) and `./view` (`withActions`) are sibling service files not listed in the graph neighbors; they handle caller scoping and per-row action availability respectively.
