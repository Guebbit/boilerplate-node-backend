---
source: src/modules/payments/repository.ts
sha256: 3b57c71cc3aed5315d28883eef791ef16dc671b88274331219e8f55c12c9ddf6
generated_at: 2026-11-14T21:05:11.669332+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/repository.ts

## Purpose

Repository layer for the payments aggregate. Wraps the generic `createRepository` factory with payment-specific guarded writes (conditional status transitions, dispute recording, upserts) and the read paths the staff UI and background sweeps actually take: paginated staff list, refund searches, refund sweeps, and the "one payment per order" intent/offline upsert. The unique index on `orderId` is what lets the upsert be a single `findOneAndUpdate` with no prior read.

## Key elements

- **`PaymentWire`** – exported wire type; `Wire<PaymentDocument>` minus the internal `providerRef` field.
- **`refundMatch(filters)`** – builds the `$match` stage for the Refunds tab over an unwound refund array.
- **`refusalMatch(refusal)`** – builds a `$match` stage that selects one refusal kind (`final` / `not-final` / `reversed`) from unwound refund records.
- **`claimableRefund(now, staleBefore)`** – `$elemMatch` body describing a refund the sweep should re-send (failed, not final, retry due) or a stale `pending` one.
- **`rereadableRefund(staleBefore)`** – `$elemMatch` body for a `pending` refund the provider already accepted; the sweep asks the provider for status instead of re-sending.
- **`REFUND_ROW_PROJECTION`** – the `$project` stage that flattens an unwound refund into a `RefundRow`.
- **`aggregateRefundRows(pipeline)`** – runs the aggregation then calls `stringifyDecimals` on each row (Mongoose aggregation does not coerce `Decimal128`).
- **`PAYMENT_SEARCHABLE` / `PAYMENT_SORTABLE`** – declarative filter/sort field maps consumed by the paginated staff-list search (via `@infrastructure/persistence/search` helpers).
- **`OPEN_TRANSFER_ROW` / `CANCELED_TRANSFER_ROW`** – row-shape constants used in upsert filters so a card or operator record can "take over" an unpaid bank-transfer row.
- **`upsertOutcome(query)`** – shared `findOneAndUpdate` executor; maps duplicate-key to `null` (meaning another writer won) and returns `{ payment, created }`.
- **`upsertConfirmable(orderId, userId, changes, alsoTakes?)`** – shared filter + upsert options for `upsertIntent` and `upsertOffline`; `$setOnInsert` writes `userId` only when defined.
- **`MixSums`** – shape of the per-method/provider/currency mix aggregation.
- **`RecordedDispute`** – return type of `paymentRepository.recordDispute`: outcome (`opened` | `updated`), the payment doc, and optionally the previous dispute.
- **`UpsertedPayment`** – `{ payment, created }` returned by the upsert paths.
- **`paymentRepository`** (exported, truncated in view) – the repository instance assembled from the above helpers plus the generic CRUD from `createRepository`.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** – provides `createRepository`, `toObjectId`, `withScope`, and the `Wire` / `Repository` base types; this file is a direct consumer.
- **`src/infrastructure/persistence/search.ts`** – supplies `buildPaginatedMeta`, `normalizePagination`, `sortOf`, `SORT_COLLATION`, `DEFAULT_SORT` for the paginated/sorted staff list.
- **`src/infrastructure/persistence/money-field.ts`** – `stringifyDecimals` is applied to every refund row returned from aggregation.
- **`src/infrastructure/persistence/conditional-status.ts`** – `updateStatusIfIn` is used for guarded status writes so a stale write is a no-op rather than an error.
- **`src/infrastructure/persistence/mongo-errors.ts`** – `isDuplicateKey` lets the upsert paths treat a race-lost collision as a valid `null` answer.
- **`src/infrastructure/persistence/external-key-query.ts`** – `EXTERNAL_KEY_QUERY` builds the index-backed filter for lookups by external provider reference.
- **`src/infrastructure/persistence/report.ts`** – `ReportWindow` type is used by the reporting / dispute window logic.
- **`src/infrastructure/persistence/changes.ts`** – `setAndUnset` splits a field map into `$set` and `$unset` bodies for the upsert writes.
- **`src/modules/payments/model.ts`** – provides `paymentModel` (the Mongoose model), `applyPaymentTransform`, and the `PaymentDocument` / `RefundRecord` / `DisputeRecord` / `RefundSettlement` types.
- **`src/modules/payments/domain/index.ts`** (barrel re-exporting `disputes.ts` and `lifecycle.ts`) – supplies the status-constant sets (`CONFIRMABLE_PAYMENT_STATUSES`, `SETTLEABLE_PAYMENT_STATUSES`, `REAPABLE_PAYMENT_STATUSES`, `REFUNDABLE_PAYMENT_STATUS`, `FINAL_REFUND_FAILURES`, `OPEN_REFUND_STATUSES`), `MANUAL_PROVIDER`, and `openDisputeFilter`.
- **`src/modules/payments/providers/registry.ts`** – `paymentProviderRegistry` is referenced for provider-aware operations.

## Notes

- **TS7056 workaround:** the return type of `upsertOutcome` is written out explicitly because Mongoose's generic inference over `findOneAndUpdate` is too large for TypeScript to resolve at an export boundary.
- **`null` ≠ error in upserts:** a duplicate-key collision returns `null` by design; it signals "another writer already inserted this order's row, the money already moved." Callers must handle `null` as a valid outcome.
- **Decimal128 in aggregations:** `paymentModel.aggregate` returns raw `Decimal128` for money fields. `aggregateRefundRows` stringifies them; any new aggregation path over money fields must do the same.
- **`providerRef` is internal:** it is stripped from the wire contract (`PaymentWire`) and never appears in search/sort filters.
- **`canceled` refund handling:** `RefundFailureReason.canceled` is excluded from "not-final" refusal matches and from `claimableRefund`; a canceled refund is terminal, like a final refusal.
- **`$setOnInsert` vs `$set`:** `upsertConfirmable` uses `setAndUnset` for the caller's fields and `$setOnInsert` for `userId`, so a refresh never overwrites an existing `userId` and an insert with no payer writes no `userId` key at all.
