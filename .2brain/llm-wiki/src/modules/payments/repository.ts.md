---
source: src/modules/payments/repository.ts
sha256: 8b9bf69f6a03d82a9618d91441e35623142b11a50457ab19b6d3d0a210b61d59
generated_at: 2026-10-29T05:09:18.621631+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/repository.ts

## Purpose

Data-access layer for the Payments collection. It combines the generic CRUD factory (`createRepository`) with the bespoke reads and guarded writes that the payments service actually performs: intent/offline upserts, status transitions, refund sweeps, dispute recording, and the provider-facing lookups. The file exists to keep every Mongoose query, projection, and aggregation in one place so that service code only expresses intent.

## Key elements

- **`paymentRepository`** (exported) – The primary object. Extends the factory's `Repository<PaymentDocument, PaymentWire>` with domain-specific methods: `ownerScope`, `findByIdScoped`, `findByOrderId`, `findByProviderRef`, `attachProviderRef`, `upsertIntent`, `upsertOffline`, `recordDispute`, `searchRefunds`, `recordRefundSettlement`, `sweepClaimableRefunds`, `sweepRereadableRefunds`, `mix`, `searchStaff`, `report`.
- **`PaymentWire`** (exported type) – The wire contract for a payment row; identical to `Wire<PaymentDocument>` minus `providerRef`, which is internal bookkeeping.
- **`UpsertedPayment`** (exported interface) – Result of an upsert: the row plus a `created` boolean.
- **`RecordedDispute`** (exported interface) – Outcome of `recordDispute`: `'opened' | 'updated'`, the payment snapshot, and optionally the previous dispute record.
- **`RefundRow`** / **`RefundFilters`** / **`MixSums`** (exported interfaces) – Shapes for refund aggregation rows, the staff refund-tab filter, and the per-method/provider/currency mix summary.
- **`upsertConfirmable`** (internal) – Shared `findOneAndUpdate` mechanics for `upsertIntent` and `upsertOffline`. Maps a duplicate-key collision to `null` rather than an error, because the collision *is* the answer "this order's money already moved."
- **`claimableRefund`** / **`rereadableRefund`** (internal) – Build the `$elemMatch` body that identifies refunds ready for re-send vs. re-read during the sweep.
- **`refundMatch`** (internal) – Builds the `$match` conditions for the staff Refunds tab over an unwound refund.
- **`aggregateRefundRows`** (internal) – Wraps aggregation + `reviveDecimals` so Decimal128 amounts come back as numbers.
- **`PAYMENT_SEARCHABLE`** / **`PAYMENT_SORTABLE`** (internal consts) – Single declaration of what the staff list may filter and sort by; passed to `createRepository`.
- **`base`** (internal) – The `createRepository` instance kept by name so bespoke methods can reuse `buildWhere`, `count`, `findAll`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `persistence/create-repository.ts` | Provides the `createRepository` factory, `toObjectId`, `withScope`, and the `Repository`/`Wire` types that this file extends. |
| `persistence/search.ts` | `normalizePagination`, `sortOf`, `buildPaginatedMeta`, `DEFAULT_SORT`, `SORT_COLLATION` power the paginated/sortable staff list and refund tab. |
| `persistence/conditional-status.ts` | `updateStatusIfIn` is the guarded write primitive used by status-transition methods so that only the expected prior status can be overwritten. |
| `persistence/changes.ts` | `setAndUnset` splits a plain object into `$set`/`$unset` for the upsert `update` document. |
| `persistence/money-field.ts` | `reviveDecimals` converts Mongoose Decimal128 values to JS numbers after aggregation. |
| `persistence/mongo-errors.ts` | `isDuplicateKey` lets `upsertOutcome` swallow the expected E11000 collision as a business answer (`null`). |
| `persistence/external-key-query.ts` | `EXTERNAL_KEY_QUERY` is the shared predicate shape for `findByProviderRef`. |
| `persistence/report.ts` | `ReportWindow` type constrains the `report` method's date parameters. |
| `domain/index.ts` | Re-exports the status sets (`CONFIRMABLE_PAYMENT_STATUSES`, `SETTLEABLE_PAYMENT_STATUSES`, `REAPABLE_PAYMENT_STATUSES`, `OPEN_REFUND_STATUSES`, `REFUNDABLE_PAYMENT_STATUS`), `MANUAL_PROVIDER`, `openDisputeFilter`, and `FINAL_REFUND_FAILURES` used in queries. Individual domain files (`disputes.ts`, `lifecycle.ts`) supply the constants consumed via this barrel. |
| `model.ts` | `paymentModel` (the Mongoose model) and `applyPaymentTransform` (wire serializer) are the core dependencies; `PaymentDocument`, `RefundRecord`, `DisputeRecord`, `RefundSettlement` are the type shapes. |
| `providers/registry.ts` | `paymentProviderRegistry` is called to resolve the concrete provider during refund sweep and settlement operations. |

## Notes

- **Duplicate-key is not an error.** In both upserts, a Mongo E1100 on the unique `orderId` index is caught and returned as `null`, signalling "another writer already moved this order's money." Callers must treat `null` as a valid business outcome, not a failure.
- **`includeResultMetadata`** is used (rather than comparing `value._id`) to determine whether the upsert inserted or updated. The driver flag is documented in the Mongoose API; the code relies on `lastErrorObject.updatedExisting === false`.
- **`providerRef` is intentionally absent from the wire type.** `applyPaymentTransform` omits it and `PaymentWire` mirrors that omission. Any consumer that needs the provider's id must query the document directly, not the wire shape.
- **Decimal128 revival is manual after aggregation.** Mongoose's query path auto-hydrates, but `aggregate().exec()` returns raw BSON; every refund-row and mix query must pass through `reviveDecimals` before the numbers are meaningful.
- **`userId` is insert-only.** In `upsertConfirmable`, `userId` goes into `$setOnInsert` and is never overwritten on an existing row, so a payment recorded after the payer's account is erased still has no `userId`.
- **`OPEN_TRANSFER_ROW` / `CANCELLED_TRANSFER_ROW`** encode two extra "takeover" shapes beyond `CONFIRMABLE_PAYMENT_STATUSES` so that a card intent or operator entry can replace a stale manual-transfer row without colliding.
