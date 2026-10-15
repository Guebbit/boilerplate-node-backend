---
source: src/modules/payments/repository.ts
sha256: 09457b0865f482dd4307d6a6153792f437d65c98161272812843e560188c5435
generated_at: 2026-10-15T11:28:41.767999+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/repository.ts

## Purpose

The persistence layer for the payments domain. It exposes standard CRUD (via the shared repository factory) plus every bespoke lookup and guarded write the payment services need: owner-scoped reads, the one-payment-per-order upsert, status-transition writes, refund lifecycle operations, staff/refund search, and the aggregation queries behind the Mix and Reap reports.

## Key elements

- **`PaymentWire`** – exported type; the wire shape with `providerRef` stripped (internal bookkeeping, never in the API contract).
- **`PAYMENT_SEARCHABLE` / `PAYMENT_SORTABLE`** – single source of truth for which fields the staff list can filter and sort on.
- **`aggregatePayments` / `aggregateRefundRows`** – thin wrappers around `paymentModel.aggregate`; the refund variant post-processes rows with `reviveDecimals` to convert Decimal128 → number.
- **`refundMatch`** – builds the `$match` conditions for the Refunds tab from a `RefundFilters` object.
- **`upsertConfirmable`** – shared mechanics for `upsertIntent` and `upsertOffline`: one `findOneAndUpdate` with an upsert guarded by a `$in` on confirmable statuses; duplicate-key is caught and returned as `null` (meaning "this order's money already moved").
- **`base`** – the standard CRUD object from `createRepository`, spread into the final export.
- **`paymentRepository`** – the exported singleton. Combines `base` with:
  - Scoped reads: `ownerScope`, `findByIdScoped`, `findByOrderId` (scope lives in the filter, never checked post-read).
  - Unscoped read: `findByProviderRef` (webhook path, authenticated by signature upstream).
  - Writes: `attachProviderRef`, `upsertIntent`, `upsertOffline`, `detachUserId`, `deleteAbandonedBefore`, `updateStatusIfIn`.
  - Refund operations: `addRefund`, `settleRefund`, `failRefund`.
  - Search & reporting: `searchStaff`, `searchRefunds`, `sumMix`, `findOpenRefundRows`, `findWithOpenRefunds`, `findStaleInFlight`.
- **`UpsertedPayment`** – `{ payment, created }` discriminated by `includeResultMetadata` so callers know whether a row was inserted or refreshed.
- **`MixSums` / `RefundRow` / `RefundFilters`** – exported shapes for aggregation results and refund-tab input.

## Relationships

- **`./model`** – imports `paymentModel` (the Mongoose model) and `applyPaymentTransform` (document → wire mapping used by the factory and by `PaymentWire`).
- **`./domain` (index)** – imports the status-guard constants (`CONFIRMABLE_PAYMENT_STATUSES`, `OPEN_REFUND_STATUSES`, `SETTLEABLE_PAYMENT_STATUSES`, `REAPABLE_PAYMENT_STATUSES`) that bound which transitions a write is allowed to attempt.
- **`@infrastructure/persistence/create-repository`** – provides `createRepository`, `toObjectId`, `withScope`, and the `Repository`/`Wire` generic types that shape the base CRUD.
- **`@infrastructure/persistence/search`** – provides pagination, sort-collation, and `buildPaginatedMeta` used by `searchStaff` and `searchRefunds`.
- **`@infrastructure/persistence/money-field`** – `reviveDecimals` converts Decimal128 fields in aggregation rows back to plain numbers.
- **`@infrastructure/persistence/mongo-errors`** – `isDuplicateKey` lets `upsertConfirmable` translate a unique-index collision into a `null` return instead of a thrown error.
- **`@infrastructure/persistence/changes`** – `setAndUnset` splits a changes object into `$set` / `$unset` for the upsert.
- **`@infrastructure/persistence/report`** – `ReportWindow` type constrains the `sumMix` parameter.
- **Services (`intent`, `list`, `announce`, `effects`, `notify`)** – depend on this file: they call `paymentRepository` methods and pass session handles for multi-document transactions.

## Notes

- **Scope-in-the-filter rule.** `findByIdScoped` and `findByOrderId` spread the scope into the MongoDB filter. Checking ownership after the read would create a timing window and an information leak; this file never does that.
- **`findByProviderRef` is the only unscoped read.** It exists for webhook delivery where the caller is the provider, not a user; authentication is a signature check upstream, not a scope filter.
- **`upsertConfirmable` returns `null` on duplicate key.** Callers must treat `null` as "already confirmed" (the unique index on `orderId` enforces one-payment-per-order at the database level).
- **`includeResultMetadata: true`** is required on the `findOneAndUpdate` options to get `lastErrorObject.updatedExisting`, which powers the `created` boolean in `UpsertedPayment`.
- **`$setOnInsert` for `userId`.** On an update path the payer id is intentionally not written; an `undefined` userId means "no payer to record" (e.g., account already erased).
- **`paymentModel` is imported directly, not through the factory.** The factory only shapes the CRUD surface; all bespoke queries go through the raw model.
- **Aggregation rows need `reviveDecimals`.** Mongoose's `aggregate` does not apply the model's virtuals or schema casts, so Decimal128 amounts arrive as raw BSON in `MixSums` and `RefundRow`.
