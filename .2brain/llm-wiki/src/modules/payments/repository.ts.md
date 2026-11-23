---
source: src/modules/payments/repository.ts
source_sha256: 178d7367f1cce3b3639f41bdfa27db318c43682d6af585d9911b5f13669a1fd0
context_sha256: 1df47c303ffc256c150e36b1b850f7755d283fb77d895bfd02cf6279d5d2af63
generated_at: 2026-11-22T06:48:38.967121+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/repository.ts

## Purpose
Mongo persistence layer for payments. It builds the standard CRUD repository through the repository factory and adds the payment-specific lookups, aggregations and guarded writes. The module header says `unique` on `orderId` makes "one payment per order" a database fact, so the intent upsert is a single `findOneAndUpdate` with no read first. The return type is written out explicitly because Mongoose's generics are too large for TypeScript to infer at an export boundary (TS7056).

## Key elements
Only the first part of the file is visible here, so this list covers what appears in that part.

- `PaymentWire`: the search wire type. It is `Wire<PaymentDocument>` without `providerRef`, which `applyPaymentTransform` also omits.
- `PAYMENT_SORTABLE` / `PAYMENT_SEARCHABLE`: declarative sort and filter config for the staff list. It covers `orderId`, the exact fields `method`, `provider`, `reference` and `transferReference`, `amount` ranges, and `createdAt` and `receivedAt` date ranges. `displayStatus` is deliberately left out; `searchStaff` adds its query itself.
- `MixSums`: the row type for the payments mix, grouped by method, provider and currency, with `amount` as a decimal sum.
- `RecordedDispute`: the result of `recordDispute`, with outcome `opened` or `updated`, the payment, and the previous dispute record for updates.
- `RefundRow` / `RefundFilters`: an unwound refund together with its payment and order ids, and the filters for the Refunds tab (status, reason, orderId, created range, paging).
- `refusalMatch(refusal)`: builds the `$match` for an attention kind over unwound refunds (`final`, `not-final`, `reversed`, or none for the manual read). It uses `FINAL_REFUND_FAILURES`, `reversedAt` and `reversedAfterSettling`.
- `refundMatch(filters)`: builds the `$match` conditions on `refunds.*` from `RefundFilters`.
- `aggregatePayments` / `aggregateRefundRows`: run a pipeline on `paymentModel`. The refund variant runs `stringifyDecimals` on each row, because aggregation does not convert `Decimal128` amounts to numbers.
- `REFUND_ROW_PROJECTION`: the shared `$project` that every refund read ends with.
- `claimableRefund(now, staleBefore)`: an `$elemMatch` body for refunds that may be sent now. These are `failed` records that are not final, canceled or reversed and whose retry delay has passed, and `pending` records with no `providerRefundRef` and a missing or stale `attemptedAt`.
- `rereadableRefund(staleBefore)`: matches `pending` refunds the provider already holds (`providerRefundRef` set, not reversed, stale attempt). The sweep re-reads these instead of re-sending them.
- `OPEN_TRANSFER_ROW` / `CANCELED_TRANSFER_ROW`: row shapes that an upsert may take over. The first is a manual-provider `requires_action` bank transfer. The second is a `canceled` transfer that has a `transferReference`.
- `UpsertedPayment` / `upsertOutcome(query)`: turn a `findOneAndUpdate` result into `{ payment, created }`. A duplicate-key error becomes `null`, meaning another writer inserted this order's row first.
- `upsertConfirmable(orderId, userId, changes, alsoTakes)`: the mechanics shared by `upsertIntent` and `upsertOffline`. It filters on the order id and a status in `CONFIRMABLE_PAYMENT_STATUSES` (or one of the `alsoTakes` shapes). It applies `changes` through `setAndUnset` and sets `userId` only on insert, and only when a payer id is given.

## Relationships
- `src/modules/payments/model.ts`: supplies `paymentModel`, `applyPaymentTransform` and the `PaymentDocument`, `DisputeRecord`, `RefundRecord` and `RefundSettlement` types.
- `src/modules/payments/domain/index.ts`: supplies the status sets and filters used in queries. These are `CONFIRMABLE_PAYMENT_STATUSES`, `REFUNDABLE_PAYMENT_STATUS`, `SETTLEABLE_PAYMENT_STATUSES`, `REAPABLE_PAYMENT_STATUSES`, `OPEN_REFUND_STATUSES`, `FINAL_REFUND_FAILURES`, `MANUAL_PROVIDER` and `openDisputeFilter`.
- `src/infrastructure/persistence/create-repository.ts`: provides `createRepository`, `toObjectId`, `withScope`, and the `Repository` and `Wire` types.
- `src/infrastructure/persistence/conditional-status.ts`: provides `updateStatusIfIn`, imported as `conditionalStatus`, for guarded status writes.
- `src/infrastructure/persistence/search.ts`: provides pagination, sort, collation and paginated-meta helpers.
- `src/infrastructure/persistence/money-field.ts`: provides `stringifyDecimals`.
- `src/infrastructure/persistence/mongo-errors.ts`: provides `isDuplicateKey`.
- `src/infrastructure/persistence/changes.ts`: provides `setAndUnset`.
- `src/infrastructure/persistence/external-key-query.ts` and `src/infrastructure/persistence/report.ts` (`ReportWindow`): imported here, but the visible part does not show how they are used.
- `src/modules/payments/providers/registry.ts`: `paymentProviderRegistry` is imported, but the visible part does not use it.
- `src/infrastructure/adapters/logger.ts`, `src/modules/payments/domain/disputes.ts`, `src/modules/payments/domain/lifecycle.ts` and `src/modules/payments/services/announce.ts` are neighbors, but nothing in the visible part shows an interaction with them.

## Notes
- The upsert helpers return `null` on a duplicate key instead of throwing. This means "this order's money already moved". It is not an error.
- A `canceled` refund record is closed for good, like a final refusal. A refund with `reversedAt` is owed another way and is never sent again.
- A `pending` refund that already has `providerRefundRef` is re-read from the provider, never re-sent.
- `refusalMatch` with `not-final` replaces the caller's own canceled filter, so it excludes `canceled` itself.
- A card never takes over a canceled-transfer row; only an operator recording a late transfer does.
