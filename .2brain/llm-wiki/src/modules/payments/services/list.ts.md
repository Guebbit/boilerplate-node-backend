---
source: src/modules/payments/services/list.ts
sha256: cbd662151a64b91e4ef1cc43e65265b99765297479de7b15f2a15e4e20975a4a
generated_at: 2026-10-29T05:11:41.080276+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/list.ts

## Purpose

Server-side read queries behind the staff Payments page: the paginated payment list, the cross-payment refund list, and the "needs a person" attention feed. All three are `display:Payment` routes, so every row carries provider identifiers. The file composes data from the payments repository with order lookups and domain-pure checks to produce display-ready rows.

## Key elements

- **`listPayments(filters, authContext?)`** – Returns one paginated page of `Payment` rows. Canonicalises `transferReference` via `parseReference` (invalid → immediate empty page), builds label filters (`displayStatusFilter`, `openDisputeFilter`), queries `paymentRepository.searchStaff`, then batch-hydrates order number/email via `orderService.findManyByIds`.
- **`listRefunds(filters)`** – Returns one paginated page of `RefundListItem` rows across all payments, newest first. Maps raw `RefundRow` through `refundRow` (normalises IDs to strings, ISO-dates, optional fields).
- **`listAttention()`** – Returns a flat, oldest-first array of `PaymentAttentionItem` rows. Fires six repository queries in parallel (stale, final-refused, manual, reversed, over-refunded, open-dispute), maps each to attention items, deduplicates over-refunded IDs out of the stale/refused buckets, then sorts by `since`.
- **`staffRow(payment, order?, authContext?)`** – Internal mapper that spreads `withActions(payment, undefined, authContext)` (so `pay` stays false) and conditionally attaches `orderNumber`/`email`.
- **`refundRow`, `refundAttention`, `exceedingRows`, `disputeRows`, `refundedForGood`, `dueByOf`** – Internal mappers/helpers that translate raw repository rows into the typed list/attention shapes, applying domain checks (`exceedsRemaining`, `exceedsBy`, `refundDueBy`) and money primitives (`addMoney`, `toDecimalAmount`, `toMinorUnits`).
- **`ATTENTION_LIMIT = 100`** – Per-source cap for attention queries.

## Relationships

- **`@infrastructure/persistence/search`** – Uses `normalizePagination`, `buildPaginatedMeta`, and the `PaginatedMeta` type for every paginated response.
- **`@modules/orders`** (`index.ts` / `services/index.ts`) – Calls `orderService.findManyByIds` to batch-fetch order number and email for list rows.
- **`../config`** – Reads `paymentAttentionMinutes()` to compute the "stale" cutoff in `listAttention`.
- **`../domain`** (`index.ts`, and its members `display-status.ts`, `transfer-reference.ts`, `disputes.ts`, `lifecycle.ts`) – Imports pure predicates and formatters: `displayStatusFilter`, `openDisputeFilter`, `parseReference`, `exceedsBy`, `exceedsRemaining`, `refundDueBy`.
- **`@domain-primitives/money`** – Uses `addMoney`, `toDecimalAmount`, `toMinorUnits` for refund-amount arithmetic in attention rows.
- **`../model`** – Consumes the `PaymentDocument` and `RefundRecord` shapes as the raw data it maps over.
- **`../repository`** – All data access goes through `paymentRepository` (`searchStaff`, `searchRefunds`, `findOpenRefundRows`, `findOverRefunded`, `findWithOpenDisputes`); also imports the `RefundFilters` and `RefundRow` types.
- **`./scope`** – Calls `callerScope(authContext)` to scope every repository query to the caller's permissions.

## Notes

- **Invalid `transferReference` silently returns an empty page.** There is no partial-match or "did-you-mean" path; a near-miss code looks identical to "no results."
- **Deduplication in `listAttention`.** Refund IDs that appear in the over-refunded (`exceeding`) bucket are filtered out of the stale and final-refused buckets so a single problem isn't shown twice.
- **`since` semantics differ by kind.** Reversed refunds anchor on `reversedAt` (the bounce), not `createdAt`; all other kinds anchor on `createdAt` or `openedAt`.
- **`staffRow` intentionally omits the order document.** The `pay` action stays `false` in list context; only `actions.refund` (from `withActions`) is surfaced.
- **`refundedForGood`** only counts refunds with `status === 'succeeded'` and no `reversedAt`; it is used solely to annotate dispute rows with `alreadyRefunded`.
