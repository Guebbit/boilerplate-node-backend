---
source: src/modules/payments/repository.ts
sha256: 99d823e3682f11e5475b101d6270e9321f0a629428dbbb0a652c0dc8a795d545
generated_at: 2026-11-08T07:24:44.342062+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/repository.ts

## Purpose

Repository layer for the Payments domain. Wraps `paymentModel` (Mongoose) into a `Repository` built via the shared factory, and adds the specific guarded writes and lookups that payment flows actually need: intent/offline upserts keyed on `orderId`, dispute recording, refund-row searches, and a paginated staff list. The `unique` index on `orderId` makes "one payment per order" a database invariant, so upserts are a single `findOneAndUpdate` with no preceding read.

## Key elements

- **`paymentRepository`** (exported via `createRepository`) — the public repository instance; exposes CRUD plus the domain-specific operations below.
- **`PaymentWire`** (exported type) — wire contract for a payment; `Omit<Wire<PaymentDocument>, 'providerRef'>` because `providerRef` is internal bookkeeping omitted by `applyPaymentTransform`.
- **`UpsertedPayment`** (exported interface) — result of an upsert: the document and a `created` boolean.
- **`RecordedDispute`** (exported interface) — outcome of `recordDispute`: `'opened' | 'updated'`, the payment snapshot, and optionally the previous dispute record.
- **`RefundRow` / `RefundFilters` / `MixSums`** (exported types) — shapes for refund-row projections, refund-tab filter params, and the mix aggregation.
- **`upsertConfirmable`** (internal) — shared `findOneAndUpdate` upsert for `upsertIntent` and `upsertOffline`; accepts `orderId`, optional `userId` (insert-only), `changes` (via `setAndUnset`), and extra `alsoTakes` row shapes. Maps duplicate-key to `null`.
- **`upsertOutcome`** (internal) — normalises a `findOneAndUpdate` result (or duplicate-key error) into `UpsertedPayment | null`.
- **`refusalMatch` / `refundMatch` / `claimableRefund` / `rereadableRefund`** (internal) — build `$match` / `$elemMatch` stages for the various refund attention kinds and the sweep's claimable/re-readable predicates.
- **`aggregateRefundRows`** (internal) — runs an aggregation ending in `REFUND_ROW_PROJECTION`, then calls `stringifyDecimals` on every row.
- **`PAYMENT_SEARCHABLE` / `PAYMENT_SORTABLE`** (internal) — single declaration of filterable and sortable fields for the staff list.
- **`OPEN_TRANSFER_ROW` / `CANCELED_TRANSFER_ROW`** (internal) — filter objects encoding which unrecorded / late bank-transfer rows an upsert may take over.

## Relationships

- **`./model`** — imports `paymentModel` (the Mongoose model) and `applyPaymentTransform`; also imports `PaymentDocument`, `RefundRecord`, `DisputeRecord`, `RefundSettlement` types.
- **`./domain`** — imports status-constant sets (`CONFIRMABLE_PAYMENT_STATUSES`, `SETTLEABLE_PAYMENT_STATUSES`, `REAPABLE_PAYMENT_STATUSES`, `REFUNDABLE_PAYMENT_STATUS`, `OPEN_REFUND_STATUSES`, `FINAL_REFUND_FAILURES`), `MANUAL_PROVIDER`, and `openDisputeFilter`.
- **`./providers/registry`** — imports `paymentProviderRegistry` (used by operations that need to talk to a provider).
- **`@infrastructure/persistence/create-repository`** — imports `createRepository`, `toObjectId`, `withScope`, and the `Repository` / `Wire` generics that shape the public API.
- **`@infrastructure/persistence/conditional-status`** — imports `updateStatusIfIn` (aliased `conditionalStatus`) for guarded status transitions.
- **`@infrastructure/persistence/mongo-errors`** — imports `isDuplicateKey` to catch upsert collisions.
- **`@infrastructure/persistence/money-field`** — imports `stringifyDecimals` to post-process `Decimal128` values in aggregation results.
- **`@infrastructure/persistence/search`** — imports `normalizePagination`, `buildPaginatedMeta`, `sortOf`, `DEFAULT_SORT`, `SORT_COLLATION`.
- **`@infrastructure/persistence/changes`** — imports `setAndUnset` to split upsert changes into `$set` / `$unset`.
- **`@infrastructure/persistence/external-key-query`** — imports `EXTERNAL_KEY_QUERY` for lookups by external reference.
- **`@infrastructure/persistence/report`** — imports the `ReportWindow` type used in reporting queries.

## Notes

- **Duplicate-key is a signal, not an error.** `upsertOutcome` catches `isDuplicateKey` and returns `null`; callers treat `null` as "another writer already moved this order's money." Do not wrap these calls in a try/catch that re-throws.
- **`providerRef` is never in the wire type.** `applyPaymentTransform` strips it; `PaymentWire` reflects that. Adding it back to a response will break the contract.
- **Explicit return types on exports.** The file header notes that Mongoose's generics are too large for TS to infer at an export boundary (TS7056), so return types are written out by hand.
- **`stringifyDecimals` is always applied after refund aggregations.** MongoDB returns `Decimal128` in aggregations; forgetting the post-step yields non-serialisable values downstream.
- **`OPEN_TRANSFER_ROW` / `CANCELED_TRANSFER_ROW` encode policy.** A card upsert may take over an open transfer row, but only an operator may take over a canceled one. These objects are the single source of truth for which rows are claimable.
- **`userId` is insert-only.** In `upsertConfirmable`, `userId` goes into `$setOnInsert`; an update to an existing row never overwrites it.
