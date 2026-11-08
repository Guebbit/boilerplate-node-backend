---
source: src/modules/orders/repository.ts
sha256: 0d7c7cd8b8134905bdf675475df00f76cfedab80162c8a2a3cbdae62c2a07d47
generated_at: 2026-11-08T06:54:54.040438+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/repository.ts

## Purpose

The order repository. Orders embed product snapshots, so filtering (e.g. by `items.product._id`) is a pipeline concern rather than a simple query. This module extends the generic repository factory with aggregation-based search, PII encryption on write, scoped single-reads, atomic conditional status transitions, and streaming exports.

## Key elements

- **`base`** — result of `createRepository`; supplies plain CRUD and the declared searchable spec (objectIds, exact, presence, dateRanges, sortable).
- **`create`** — the single write path for a new order; assigns `_id` if absent and encrypts PII via `encryptOrderPii` before insert.
- **`search`** — paginated aggregation search; builds `$match` via `withProjectionFilters`, applies scope, runs count + page pipelines, returns normalized items and `PaginatedMeta`.
- **`countMatching`** — same `$match` as `search`; used as an export-size guard before any row is read.
- **`streamMatching`** — async generator yielding normalized orders one at a time via a server-side cursor (`batchSize: 500`) for large exports.
- **`findByIdScoped`** — `findOne({ _id, ...scope })`; scope rides in the same query so ownership is never checked after the read.
- **`ownerScope`** — coerces a user-id string to `ObjectId` for use as a scope filter.
- **`updateStatusIfIn`** — atomic conditional status transition (filter carries `from`-states); delegates to shared `conditional-status`.
- **`aggregate`** — thin wrapper around `orderModel.aggregate` with optional `SORT_COLLATION`.
- **`withNormalizedEmailFilter`** — applies `normalizeEmail` to the `email` key because `$match` does not cast the way `find()` does.
- **`withProjectionFilters`** — maps derived `paymentStatus`/`returnStatus` to their underlying stored-field predicates via `$and`.
- **`ORDER_SORTABLE`** — the only fields a client may sort by; `totalPrice` is excluded (derived at serialisation).

## Relationships

- **`create-repository.ts`** — provides the factory, `toObjectId`, `withScope`, and the `Repository`/`Wire`/`AppendOnlyLedger` types this module builds on.
- **`search.ts`** — supplies `normalizePagination`, `buildPaginatedMeta`, `DEFAULT_SORT`, `SORT_COLLATION`, `sortOf`, and the `PaginatedMeta` type used by every read path here.
- **`normalize-email.ts`** — `normalizeEmail` is applied inside `$match` filters to compensate for the absence of schema casting in aggregation.
- **`conditional-status.ts`** — shared `updateStatusIfIn` is wrapped here with the order model and order-specific scope/session options.
- **`changes.ts`** — `setAndUnset` is imported for field-level update operations (visible in the truncated portion).
- **`versioning.ts`** — `checkedDelete` / `DeleteOutcome` are imported for versioned soft-delete.
- **`yearly-counter.ts`** — `incrementYearlyCounter` is imported for generating order numbers.
- **`reencrypt.ts`** — `reencryptOf`, `ReencryptSpec`, `ReencryptReport` are imported for the PII re-encryption workflow.
- **`outbox.ts`** — `announceInTransaction` publishes `ORDER_REDACTED` (and other domain events) within the caller's transaction.
- **`domain/anonymization.ts`** — exports the `ANONYMIZED_EMAIL` sentinel used when an order's PII is redacted.
- **`domain/index.ts`** — provides `paymentStatusFilter` and `returnStatusFilter`, the predicates that map derived statuses onto stored fields.
- **`domain/fulfillment.ts` / `projections.ts` / `withdrawal.ts`** — supply the domain types (`FulfillmentSummary`, `DeliveryClock`, `StampedPaymentStatus`, `StampedReturnStatus`) referenced by this module's signatures.
- **`cart/tests/integration/stock.test.ts`** — integration test that exercises the stock-reservation path interacting with order creation/cancellation.

## Notes

- **Scope vs. spread:** `search` and `countMatching` use `withScope(filters, scope)` rather than object spread so a client cannot overwrite the authorization boundary (e.g. a client-supplied `userId` clobbering the scope, or a scope `$or` clobbering a filter).
- **Tie-breaking:** `DEFAULT_SORT` (a composite, not bare `createdAt`) is used for the default sort because count and page are two separate aggregate calls; a tie would otherwise place one order on two pages and skip another. Orders arrive in bursts, making ties common.
- **Synchronous-throw safety:** `search`, `findByIdScoped`, and other wrappers are `async` so that a synchronous throw from `toObjectId` or `buildWhere` (malformed id) becomes a promise rejection the caller's `.catch()` handles, rather than an uncaught exception.
- **`$match` vs. `find()` casting:** Mongoose `find()` applies schema casts; `$match` does not. This module therefore normalizes emails and coerces ObjectIds *before* assembling the pipeline.
- **Single write path:** `create` is the only entry point that writes a new order document, guaranteeing PII is encrypted at rest regardless of the caller (customer checkout, admin create, factory seed).
