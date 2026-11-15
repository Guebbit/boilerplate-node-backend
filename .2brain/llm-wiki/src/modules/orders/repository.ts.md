---
source: src/modules/orders/repository.ts
sha256: 1536bda9eac0e41eb22dba22b85e9c72e1d9c3844ea4a5ec66ec3977513f2a19
generated_at: 2026-11-14T20:40:33.708326+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/repository.ts

## Purpose

Repository for the Order aggregate. Unlike other collections, orders are read through the Mongoose aggregation framework because product data is embedded (a snapshot per line item) and filtering on `items.product._id` is a pipeline concern. The factory still supplies plain CRUD; `search`, `countMatching`, and `streamMatching` override the default with pipeline-based reads. The file is also the single write path for PII encryption, atomic status transitions, and re-encryption.

## Key elements

- **`base`** — `createRepository` instance for `orderModel`; declares the searchable spec (objectIds, exact, presence, dateRanges, sortable fields) and the transform (`applyOrderTransform`).
- **`ORDER_SORTABLE`** — Maps wire sort keys (`createdAt`, `status`, `email`, `payBy`, `paidAt`) to column names. `totalPrice` is deliberately excluded (derived at serialisation, not a column).
- **`create`** — The one write path for new orders. Assigns `_id` if absent (it is in the AAD), encrypts PII via `encryptOrderPii`, then delegates to `base.create`.
- **`aggregate`** — Thin wrapper around `orderModel.aggregate`; optionally applies `collation` for `$sort`.
- **`withNormalizedEmailFilter`** — Normalises a string `email` filter before it enters `$match` (which, unlike `find()`, does not apply schema casts).
- **`withProjectionFilters`** — Merges declared filters with derived `paymentStatus`/`returnStatus` conditions from the domain layer into a single `$and` clause.
- **`search`** — Paginated read: builds a `$match` + `$sort` pipeline, runs a `$count` pass, then a `$skip`/`$limit` pass. Returns normalised items and `PaginatedMeta`.
- **`countMatching`** — Same `$match` as `search`; returns a single number. Used to refuse oversized exports before any row is read.
- **`streamMatching`** — Async generator over a server-side cursor (`batchSize: 500`) for large exports. Yields normalised `Order` objects one at a time.
- **`findByIdScoped`** — `findOne({ _id, ...scope })` in a single query so ownership check and read are atomic.
- **`ownerScope`** — Builds `{ userId: toObjectId(userId) }` to restrict a query to one user.
- **`updateStatusIfIn`** — Conditional status transition; the expected `from` statuses ride in the filter so mongod's atomic filter-evaluate guarantees only one racer wins.
- **Re-encryption / anonymisation / outbox helpers** (in truncated portion) — Wire in `reencryptOf`, `ANONYMIZED_EMAIL`, `announceInTransaction(ORDER_REDACTED)`, `incrementYearlyCounter`, and `checkedDelete`.

## Relationships

- **`create-repository`** — Provides `createRepository`, `toObjectId`, `withScope`; the structural backbone of every query in this file.
- **`search`** — Provides `normalizePagination`, `buildPaginatedMeta`, `DEFAULT_SORT`, `SORT_COLLATION`, `sortOf`; shared pagination/sort primitives.
- **`normalize-email`** — Single normalisation point so `$match` comparisons align with stored values.
- **`conditional-status`** — Shared `updateStatusIfIn` implementation; this file supplies the model and filter.
- **`changes`** — `setAndUnset` helper for field-level update composition (used in the truncated portion).
- **`versioning`** — `checkedDelete` / `DeleteOutcome` for soft-delete with version guard.
- **`yearly-counter`** — `incrementYearlyCounter` for order-number generation.
- **`reencrypt`** — `reencryptOf`, `ReencryptSpec`, `ReencryptReport` for rotating encryption keys over stored PII.
- **`outbox`** — `announceInTransaction` to emit `ORDER_REDACTED` domain events atomically with the write.
- **`domain/anonymization`** — `ANONYMIZED_EMAIL` sentinel used when redacting.
- **`domain/index` (fulfillment, projections, timeline)** — Supplies `paymentStatusFilter`, `returnStatusFilter`, `OrderTimelineType`, and stamped-status types consumed by `withProjectionFilters` and status transitions.
- **`stock.test.ts` (cart module)** — Integration test that exercises stock changes alongside order status moves, confirming the transactional coupling.

## Notes

- **`$match` does not cast.** Any field that the schema would normally cast (ObjectIds, email casing) must be coerced *before* entering the pipeline; `withNormalizedEmailFilter` and `toObjectId` exist solely for this.
- **`withScope`, not spread.** The authorization scope and the client filter are merged with `withScope` so a client cannot overwrite a scope key (e.g. `userId`) with its own filter value.
- **`DEFAULT_SORT` includes a tiebreaker.** The count pass and page pass are two separate `aggregate()` calls; without a deterministic tiebreaker, a `createdAt` tie would put one order on both pages and skip another.
- **`create` is the only insert path.** Every caller (place-order, admin create, factories) must go through it so that no document reaches the collection with plaintext PII.
- **`totalPrice` is not sortable.** It is computed at serialisation time; attempting to sort on it would produce a pipeline error.
