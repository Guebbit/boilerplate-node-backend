---
source: src/modules/payments/services/list.ts
sha256: b68addbe75bc7a5419b80a857f996af9578e539afa9896af8f7332c36a0facf4
generated_at: 2026-11-08T07:27:14.583867+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/list.ts

## Purpose

Staff-facing read endpoints for the Payments page: a paginated payment list, a paginated refund list, and a "needs-attention" feed. All three return `display:Payment`-shaped rows (each carries provider IDs). The file exists so the UI never touches the repository or domain logic directly — it composes pagination, order enrichment, canonical-reference parsing, and attention classification in one place.

## Key elements

- **`listPayments(filters, authContext?)`** – Returns one page of `Payment` rows with order number/email. Normalizes a `transferReference` via `parseReference`; an unparseable reference short-circuits to an empty page (no error). Builds an `$and` label array from `displayStatusFilter` and `openDisputeFilter`, passes them to `paymentRepository.searchStaff`, then batch-hydrates order metadata through `orderService.findManyByIds`.
- **`listRefunds(filters)`** – Returns one page of `RefundListItem` rows (newest first) from `paymentRepository.searchRefunds`. Maps each `RefundRow` through the private `refundRow` helper.
- **`listAttention()`** – Runs six repository queries in parallel (`Promise.all`) to collect stale refunds, final-refused refunds, manual refunds, reversed refunds, over-refunded payments, and open disputes. Deduplicates refund IDs that appear in the "exceeding" set, maps each group to `PaymentAttentionItem` objects, and returns them in a fixed priority order. Capped at `ATTENTION_LIMIT` (100) per source.
- **`staffRow(payment, order, authContext?)`** – Private mapper: spreads `withActions(payment, undefined, authContext)` and conditionally adds `orderNumber`/`email`.
- **`refundAttention(row, kind)`** – Private mapper for refund-based attention rows; sets `since` to `reversedAt` for `reversed_refund` kind, `createdAt` otherwise; includes `refundDueBy` via `dueByOf`.
- **`exceedingRows(payments)`** – Flattens payments whose running refund total exceeds the paid amount into `refund_exceeds_remaining` rows with an `exceedsBy` delta.
- **`disputeRows(payments)`** – Flattens `needs_response` disputes into `dispute_needs_response` rows; computes `alreadyRefunded` via `refundedForGood` (sum of succeeded, non-reversed refunds).
- **`refundedForGood(payment)`** – Sums `toMinorUnits` of settled, non-reversed refunds and returns a decimal string.
- **`dueByOf(kind, refund)`** – Returns `{ refundDueBy }` only for `refused_refund` / `reversed_refund` kinds when `refundDueBy` yields a date.

## Relationships

- **`src/modules/payments/repository.ts`** – Primary data source: `paymentRepository.searchStaff`, `.searchRefunds`, `.findOpenRefundRows`, `.findOverRefunded`, `.findWithOpenDisputes`. Also consumes the `RefundRow` / `RefundFilters` types.
- **`src/modules/orders/index.ts`** – Calls `orderService.findManyByIds` to hydrate order number and email for list rows (one batch call, no per-row fetch).
- **`src/modules/payments/domain/index.ts`** – Imports `parseReference`, `displayStatusFilter`, `openDisputeFilter`, `exceedsBy`, `exceedsRemaining`, `refundDueBy` for reference normalization, query labels, and attention classification.
- **`src/modules/payments/config.ts`** – Reads `paymentAttentionMinutes()` to compute the stale-refund cutoff.
- **`src/domain-primitives/money.ts`** – Uses `addMoney`, `toMinorUnits`, `toDecimalString`, `padDecimal`, `NO_MONEY` for all monetary arithmetic and formatting.
- **`src/domain-primitives/time.ts`** – Uses `MINUTE_MS` to convert the config's minute threshold into a millisecond cutoff.
- **`src/infrastructure/persistence/search.ts`** – Uses `normalizePagination` and `buildPaginatedMeta` to shape request/response pagination metadata.
- **`src/modules/payments/model.ts`** – Consumes `PaymentDocument` and `RefundRecord` as the stored document shapes.

## Notes

- **Silent empty page on bad reference.** If `parseReference` returns `null` (i.e. the input is not a valid RF reference), `listPayments` resolves an empty page immediately — there is no error or warning signal. A staff member who mistypes a code sees zero results with no hint.
- **Deduplication in `listAttention`.** Refund IDs appearing in the `exceeding` (over-refunded) set are excluded from the `stale_refund` and `refused_refund` buckets, but **not** from the `reversed_refund` bucket. Reversed rows are mapped unconditionally.
- **`since` semantics differ by kind.** For `reversed_refund` the timestamp is `reversedAt` (when the provider took the refund back); for all other refund kinds it is `createdAt`. This is intentional — a reversal is a problem from the bounce, not from the original request.
- **`ATTENTION_LIMIT` (100)** caps each individual repository query, not the combined result. The total attention feed can exceed 100 rows.
- **`withActions` is called with `undefined` for the order param**, meaning list rows always show the same `actions.refund` availability as the order-detail panel — they do not reflect per-order state.
