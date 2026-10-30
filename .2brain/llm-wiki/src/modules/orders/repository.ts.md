---
source: src/modules/orders/repository.ts
sha256: e269ad82cf05db29b825a63de1073c1c917661d43cd38209bb9f99991a15b211
generated_at: 2026-10-29T04:44:45.950873+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/repository.ts

## Purpose

Order repository for the orders module. Because an order embeds a product snapshot (rather than referencing a product document), list and search operations run through MongoDB's aggregation pipeline instead of `find()`. The repository factory (`createRepository`) still supplies the plain-CRUD surface; this file overrides `search` and adds the order-specific write paths (PII-encrypted create, atomic status transitions, scoped reads, and streaming export).

## Key elements

- **`base`** – Repository created by `createRepository(orderModel, …)` with a full searchable spec (objectIds, exact, presence, dateRanges, sortable). Provides `create`, `findById`, `update`, `delete`, and a default `search` that this file replaces.
- **`create(data, session?)`** – The single write path for new orders. Assigns `_id` if absent, encrypts PII via `encryptOrderPii`, then delegates to `base.create`. All callers (placeOrder, admin create, factories) go through this.
- **`aggregate(pipeline, collation?)`** – Thin wrapper over `orderModel.aggregate` that applies collation when supplied.
- **`withNormalizedEmailFilter` / `withProjectionFilters`** – Build the `$match` document. Normalise the `email` filter (since `$match` does not cast like `find()`) and splice in derived `paymentStatus` / `returnStatus` filters as `$and` clauses.
- **`search(filters, scope)`** – Aggregation-based paginated list. Runs a count pipeline and a skip/limit pipeline; applies `withScope` (not a spread) to merge the authorization scope with client filters.
- **`countMatching(filters, scope)`** – Count-only aggregation; used to gate exports before any row is read.
- **`streamMatching(filters, scope)`** – `AsyncGenerator<Order>` that walks the collection via a server-side cursor (`batchSize: 500`); normalises each batch identically to `search`.
- **`findByIdScoped(id, scope)`** – `findOne({ _id, ...scope })` in a single query so the ownership check and the read share one round-trip.
- **`ownerScope(userId)`** – Returns `{ userId: toObjectId(userId) }` for use as the scope argument.
- **`updateStatusIfIn(id, from[], to, { scope, session })`** – Atomic conditional status transition; the `from` list rides in the filter so exactly one racing writer matches.
- **`updateStatusToPaid`** *(truncated in source)* – Moves to `paid` and stamps `paidAt` in the same write.
- **`ORDER_SORTABLE`** – Field map for the `sort` filter; `totalPrice` is intentionally absent (derived at serialisation, not a column).

## Relationships

- **`@infrastructure/persistence/create-repository`** – Supplies `createRepository`, `toObjectId`, `withScope`, and the `Repository`/`Wire` type contracts this file builds on.
- **`@infrastructure/persistence/search`** – Provides `normalizePagination`, `buildPaginatedMeta`, `DEFAULT_SORT`, `SORT_COLLATION`, and `sortOf` used throughout the aggregation paths.
- **`@infrastructure/persistence/conditional-status`** – `sharedUpdateStatusIfIn` implements the atomic filter-based status transition consumed by `updateStatusIfIn`.
- **`@infrastructure/persistence/changes`** – `setAndUnset` helper for field-level update construction (used in status/field mutations).
- **`@infrastructure/persistence/versioning`** – `checkedDelete` / `DeleteOutcome` for soft-delete semantics.
- **`@infrastructure/persistence/normalize-email`** – `normalizeEmail` keeps `$match` email filters consistent with the schema cast.
- **`@infrastructure/persistence/yearly-counter`** – `incrementYearlyCounter` for the order-number sequence.
- **`@infrastructure/security/reencrypt`** – `reencryptOf` / `ReencryptSpec` / `ReencryptReport` for PII re-encryption workflows.
- **`@kernel/outbox`** – `announceInTransaction` publishes domain events (e.g. `ORDER_REDACTED`) atomically with the write.
- **`./domain` (`src/modules/orders/domain/index.ts`)** – `paymentStatusFilter` and `returnStatusFilter` translate derived status values into stored-field filters; `ANONYMIZED_EMAIL` from `./domain/anonymization` is the redaction sentinel.
- **`src/modules/cart/tests/integration/stock.test.ts`** – Integration test that exercises order creation and status transitions through this repository.

## Notes

- **`$match` does not cast.** Unlike `find()`, the aggregation `$match` stage will not run schema casts. ObjectId fields must be coerced with `toObjectId` and email normalised with `normalizeEmail` *before* the pipeline is assembled; otherwise a differently-cased or string-typed value silently matches nothing.
- **Scope is merged with `withScope`, not spread.** A plain `{...filters, ...scope}` lets a client overwrite the authorization key (e.g. `userId`) or replace a scope `$or`. `withScope` composes both as an `$and`.
- **Pagination tiebreaker.** `DEFAULT_SORT` includes a tiebreaker field. The count and page queries are two separate `aggregate` calls; without a unique sort key, a tie causes an order to appear on two pages and another to be skipped.
- **Single write path for PII.** Every new order must pass through the local `create` so `encryptOrderPii` (which binds `_id` to the AAD) runs. Bypassing it would leave plaintext PII in the collection.
- **`totalPrice` is not sortable.** It is computed at serialisation time, not stored as a column, so it is excluded from `ORDER_SORTABLE`.
- **`async` on `findByIdScoped` and `search`.** The `toObjectId` / `buildWhere` calls can throw synchronously on a malformed id; wrapping in `async` converts the throw into a rejected promise so callers' `.catch()` handlers fire normally.
