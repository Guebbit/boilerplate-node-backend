---
source: src/modules/orders/repository.ts
source_sha256: 164c710b3bb8b99465775812d33c898dc82f5127d6408ac9b4614019e058a300
context_sha256: 70619d300f019a947beffcc48faa52da2a5dcab299cb5e965f3a7b02c9aa3bc0
generated_at: 2026-11-22T06:17:46.811237+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/repository.ts

## Purpose
Order repository. Orders embed a product snapshot, so reads go through the Mongoose aggregation framework rather than `find()`. The file builds plain CRUD from the shared `createRepository` factory, then overrides `search` with an aggregation-based version and adds order-specific writes and reads (PII-encrypted create, scoped lookup, conditional status transitions, export streaming).

## Key elements
- `ORDER_SORTABLE`: allowed `sort` fields (`createdAt`, `status`, `email`, `payBy`, `paidAt`). `totalPrice` is derived at serialisation, so it is not sortable.
- `base`: `createRepository(orderModel, …)` with a `searchable` spec covering:
  - ObjectId filters: `id`, `userId`, and `productId` (mapped to `items.product._id`).
  - Exact filters: `email`, `status`, `paymentMethod`, `orderNumber`.
  - A `deleted` presence filter on `deletedAt`.
  - Date ranges for `createdAt` and `paidAt`.
- `create(data, session?)`: the single write path for new orders. It assigns `_id` if absent (the `_id` is in the AAD) and encrypts addresses and notes via `encryptOrderPii` before delegating to `base.create`.
- `aggregate(pipeline, collation?)`: runs a pipeline on `orderModel`, optionally with a collation.
- `withNormalizedEmailFilter` / `withProjectionFilters`: normalize the email filter, then build the `$match` from `base.buildWhere`. Derived `paymentStatus` and `returnStatus` filters are mapped back to stored fields via `paymentStatusFilter` and `returnStatusFilter` and combined with `$and`.
- `search(filters, scope)`: an `async` function that builds the match with `withScope`, sorts by the chosen sort or `DEFAULT_SORT`, runs a separate count and page aggregation, and returns `{ items, meta }`.
- `countMatching(filters, scope)`: the count for the same `$match` that `search` builds. It is used to refuse an export before reading rows.
- `streamMatching(filters, scope)`: an async generator that streams matching orders through a server-side cursor (`batchSize: 500`). Rows are normalized like list rows.
- `findByIdScoped(id, scope)`: `findOne({ _id, ...scope })`, resolving to `undefined` when nothing matches.
- `ownerScope(userId)`: `{ userId: ObjectId }`.
- `updateStatusIfIn(id, from, to, { scope, session })`: an atomic status transition guarded by the expected current statuses. It delegates to the shared `updateStatusIfIn`.

The rest of the file is not shown here.

## Relationships
- `src/infrastructure/persistence/create-repository.ts`: supplies `createRepository`, `toObjectId`, `withScope`, and the `Repository`, `AppendOnlyLedger` and `Wire` types.
- `src/infrastructure/persistence/search.ts`: supplies pagination (`normalizePagination`, `buildPaginatedMeta`), `DEFAULT_SORT`, `SORT_COLLATION` and `sortOf`.
- `src/infrastructure/persistence/normalize-email.ts`: normalizes the email filter, matching how the schema casts the stored field.
- `src/infrastructure/persistence/conditional-status.ts`: the shared `updateStatusIfIn` that the local wrapper delegates to.
- `src/infrastructure/persistence/yearly-counter.ts`: `incrementYearlyCounter` is imported.
- `src/infrastructure/persistence/changes.ts`: `setAndUnset` is imported.
- `src/infrastructure/persistence/versioning.ts`: `checkedDelete` and `DeleteOutcome` are imported.
- `src/infrastructure/security/reencrypt.ts`: `reencryptOf` and its spec and report types are imported.
- `src/kernel/outbox.ts`: `announceInTransaction` is imported, alongside `ORDER_REDACTED` from `./events`.
- `src/modules/orders/domain/index.ts` and `projections.ts`: `paymentStatusFilter` and `returnStatusFilter` map derived statuses to stored fields. The `OrderTimelineType`, `DeliveryClock`, `FulfillmentSummary` and stamped-status types also come from there. `fulfillment.ts` and `timeline.ts` sit behind that same index.
- `src/modules/orders/domain/anonymization.ts`: `ANONYMIZED_EMAIL` is imported.
- `./model`, `./pii`: the order models and transforms (including counter and event models), and `encryptOrderPii`.
- `src/modules/cart/tests/integration/stock.test.ts`: a related integration test; the visible code shows no direct link.

## Notes
- `$match` does not cast types the way `find()` does. Ids are coerced up front through `buildWhere` and `toObjectId`, and the email filter is normalized by hand. A raw string `userId` would silently match nothing.
- `search`, `findByIdScoped` and `countMatching` combine `scope` with the filters, and the scope is treated as the authorization boundary. `search` uses `withScope` so a client filter cannot overwrite the scope. `findByIdScoped` puts the scope in the same query as the id, so ownership is never checked after the read.
- `search` and `findByIdScoped` are `async` so that synchronous throws on malformed ids become rejections.
- `search` always sorts with a `DEFAULT_SORT` tiebreak. Without it, ties from burst-created orders would duplicate or skip rows between pages, because count and page are separate aggregations.
- `updateStatusIfIn` puts the status condition and the scope in the filter itself, so racing requests cannot both succeed. The loser gets `null`.
- Passing `session` lets writes join the caller's transaction.
