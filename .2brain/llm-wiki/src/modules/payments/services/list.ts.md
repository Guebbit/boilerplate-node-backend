---
source: src/modules/payments/services/list.ts
source_sha256: b5f8e69227881d4950a583e746c948c25fd1f76e0e78188389f78d55abcf3a7f
context_sha256: d044c5493f1f006b9f86acaa8423a0cfb9aa10cfa9ac51f20abfc915f4fd2b47
generated_at: 2026-11-22T06:51:18.949212+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/services/list.ts

## Purpose
The staff-side read services behind the Payments page: a filtered/paginated payment list, a cross-payment refund list, and a "needs attention" list of problems that require a person. All three are `display:Payment` routes, so rows carry provider ids.

## Key elements
- `listPayments(filters, authContext?)` – paginated, filtered payment search. Normalizes `transferReference` via `parseReference` (an invalid code returns an empty page), builds label filters from `displayStatus` and `disputed`, calls `paymentRepository.searchStaff` with `callerScope(authContext)`, then batch-fetches order numbers and emails and attaches them to each row.
- `staffRow` (internal) – builds a list row from a stored payment using `withActions(payment, undefined, authContext)`, so no order document is read. `pay` stays false and the row carries the same `actions.refund` as the order page panel. It adds `orderNumber` and `email` when the order is known.
- `listRefunds(filters)` – a page of refunds across all payments, newest first, via `paymentRepository.searchRefunds`, mapped by `refundRow` to `RefundListItem` with ISO date strings.
- `listAttention()` – returns `{ items: PaymentAttentionItem[] }`, oldest first, combining several sources. It uses a cutoff of `paymentAttentionMinutes()` and `findOpenRefundRows` with a per-source `ATTENTION_LIMIT` of 100. The documented kinds are: refunds open past the threshold, refunds the provider refused for good (reported at once), refunds the provider took back, refunds over the room left, payments refunded past what was paid, disputes awaiting an answer, and refunds owed by hand.
- Attention row builders (internal):
  - `refundAttention` – row from an open refund. A reversed refund's `since` is its `reversedAt`, otherwise `createdAt`.
  - `dueByOf` – adds `refundDueBy` and `refundDueRule` only when the refund has a legal deadline. Goodwill refunds get none.
  - `exceedingRows` – one row per open refund that `exceedsRemaining`, with an `exceedsBy` amount.
  - `overRefundedRows` – one row per over-refunded payment, skipping payments already held by `exceedingRows`.
  - `disputeRows` – one row per dispute in `needs_response`, with `dueBy` from the evidence deadline and `alreadyRefunded` when settled, non-reversed refunds exist (`refundedForGood`).

## Relationships
- `src/modules/orders/index.ts` – the list batch-fetches order numbers and emails from `orders` once per page, the same shape `inventory` uses to name products.
- `src/modules/payments/repository.ts` (`paymentRepository`, `RefundFilters`, `RefundRow`) – supplies `searchStaff`, `searchRefunds` and `findOpenRefundRows`.
- `src/modules/payments/domain/` – filter builders (`displayStatusFilter`, `openDisputeFilter`), reference parsing (`parseReference`), and refund and dispute rules (`refundDueBy`, `exceedsRemaining`, `exceedsBy`), imported through the domain index.
- `src/modules/payments/config.ts` – `paymentAttentionMinutes()` sets the age threshold for open refunds.
- `src/modules/payments/model.ts` – `PaymentDocument` and `RefundRecord` types.
- `src/infrastructure/persistence/search.ts` – `buildPaginatedMeta` and `normalizePagination` (used for the empty-page meta), and the `PaginatedMeta` type.
- `src/domain-primitives/money.ts` and `src/domain-primitives/time.ts` – minor-unit arithmetic and decimal formatting for amounts (`addMoney`, `subtractMoney`, `toMinorUnits`, `toDecimalString`, `padDecimal`), and `MINUTE_MS`.
- `./scope` (`callerScope`) and `./view` (`withActions`) – caller scoping and per-row actions.

## Notes
- An invalid `transferReference` yields an empty page rather than an error, so staff cannot tell that an almost-right code was close.
- `displayStatus` and `disputed` filters are not row fields. They are passed to the repository as an `$and` of label filters.
- A payment shows `refund_exceeds_remaining` rows or one `over_refunded` row, not both.
