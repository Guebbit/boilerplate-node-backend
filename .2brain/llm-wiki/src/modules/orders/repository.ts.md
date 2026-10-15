---
source: src/modules/orders/repository.ts
sha256: 0fbe73a662a8bdefa1954b6bfe6e11dd510e301fdd05543a481990440b4ae827
generated_at: 2026-10-15T11:06:25.702636+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/repository.ts

## Purpose

Order persistence layer. Because an order embeds a product snapshot and filters like `items.product._id` are pipeline concerns, reads go through the aggregation framework rather than plain `find()`. The file provides the single write path for new orders (with PII encryption), scoped reads, paginated search, status-transition writes with conditional guards, and streaming for large exports.

## Key elements

- **`base`** — Plain CRUD repository produced by `createRepository`, configured with a searchable spec (objectIds, exact match, presence, dateRanges, sortable fields). Its `search` is overridden below.
- **`create(data, session?)`** — The one write path for a new order. Assigns `_id` if absent (needed in the AAD), encrypts PII via `encryptOrderPii`, then delegates to `base.create`. All callers (placeOrder, admin create, factory) go through this.
- **`aggregate(pipeline, collation?)`** — Thin wrapper around `orderModel.aggregate` that optionally sets collation for `$sort` text ordering.
- **`withNormalizedEmailFilter(filters)`** — Normalises a string `email` in the filter bag before it reaches `$match` (which, unlike `find()`, does not cast).
- **`withProjectionFilters(filters)`** — Combines the declared filter spec with derived `paymentStatus` / `returnStatus` filters into a single `$and` so neither overwrites the other's `paymentStatus`/`paidAt` keys.
- **`search(filters, scope)`** — Paginated read: builds a `$match` (via `withScope` + `withProjectionFilters`), runs a `$count` pipeline, then a `$skip`/`$limit` pipeline. Returns `{ items: Order[], meta: PaginatedMeta }`. `async` so a malformed-id throw in `buildWhere` becomes a rejection.
- **`countMatching(filters, scope)`** — Same `$match` as `search`; used to gate an export before any rows are read.
- **`streamMatching(filters, scope)`** — Async generator that iterates a server-side aggregate cursor (`batchSize: 500`), yielding normalised `Order` objects one at a time for large exports.
- **`findByIdScoped(id, scope)`** — Single-document read with the authorization scope in the same `findOne` filter (no post-read ownership check). `async` for the same malformed-id reason.
- **`ownerScope(userId)`** — Returns `{ userId: toObjectId(userId) }`; the ObjectId coercion is required because a raw string in `$match` silently matches nothing.
- **`updateStatusIfIn(id, from[], to, scope?, effects?, session?)`** — Atomic conditional status move: the `from` list rides in the `findOneAndUpdate` filter so a race resolves to exactly one writer. Optional `effects` (pending retry actions) are stored in the same write. Joins the caller's transaction via `session`.
- **`ORDER_SORTABLE`** — Whitelist of sortable wire fields mapped to column names. `totalPrice` is intentionally excluded (derived at serialisation, not a column).

## Relationships

- **`create-repository.ts`** — Provides `createRepository` (the `base` factory), `toObjectId`, `withScope` (authorization composition), and the `Repository`/`Wire`/`AppendOnlyLedger` type contracts this file implements.
- **`search.ts`** — Provides `normalizePagination`, `buildPaginatedMeta`, `DEFAULT_SORT`, `SORT_COLLATION`, and `sortOf`, which `search`, `countMatching`, and `streamMatching` all use for consistent paging and sort ordering.
- **`normalize-email.ts`** — `normalizeEmail` is applied in `withNormalizedEmailFilter` so the `$match` email comparison matches the schema's cast.
- **`changes.ts`** — Exports `setAndUnset`, imported here (usage in the truncated portion, likely for field-level update helpers in status transitions or PII scrubbing).
- **`versioning.ts`** — Exports `checkedDelete` and `DeleteOutcome`, imported here (usage in the truncated portion, likely for soft-delete or versioned removal of orders).
- **`reencrypt.ts`** — Exports `reencryptOf`, `ReencryptSpec`, `ReencryptReport`; imported for the PII re-encryption workflow on existing orders.
- **`pii.ts`** — `encryptOrderPii` is called in `create` to encrypt addresses and notes before the document is written.
- **`model.ts`** — Supplies `orderModel` (the Mongoose model), `applyOrderTransform` (document → `Order` mapping), plus `orderNumberCounterModel`, `orderEventModel`, and `applyOrderEventTransform` for related collections.
- **`domain/index.ts`** — Provides `paymentStatusFilter` and `returnStatusFilter` (used in `withProjectionFilters`) and the `FulfillmentSummary`, `StampedPaymentStatus`, `StampedReturnStatus` types.
- **`domain/anonymization.ts`** — Exports `ANONYMIZED_EMAIL`, imported here (used in the truncated portion, likely when scrubbing PII from an order).
- **`services/crud.ts`** — Consumer of this repository's `create`, `search`, `findByIdScoped`, and related functions for order CRUD endpoints.
- **`services/cancel.ts`** — Consumer of `updateStatusIfIn` (passing cancel-specific `effects` and a `session` for the multi-write transaction).

## Notes

- **`$match` vs `find()` casting:** Aggregation `$match` does not run Mongoose schema casts. Two consequences are handled explicitly: ObjectId fields must be coerced with `toObjectId` before assembly, and email must be normalised via `normalizeEmail`. A raw string in either silently matches nothing.
- **Scope is composed with `withScope`, not spread:** A spread would let a client-supplied filter on the same key (e.g. `userId`) overwrite the authorization scope, or vice versa. `withScope` forces both to coexist in an `$and`.
- **`DEFAULT_SORT` (not bare `createdAt`):** The count and page are two separate `aggregate` calls. Without a deterministic tiebreaker, two orders with the same sort value can appear on both page 1 and page 2 (or be skipped). Orders arrive in bursts, making ties common.
- **`totalPrice` is not sortable:** It is computed at serialisation time and has no column backing, so it is deliberately excluded from `ORDER_SORTABLE`.
- **`create` is the only write path for new orders:** No code path inserts an order document with plaintext PII; all callers funnel through `create`, which encrypts before the write.
- **`updateStatusIfIn` is a single atomic write:** The status change, the conditional `from` guard, the caller scope, and any `effects` all ride in one `findOneAndUpdate`. There is no read-then-write window, so concurrent status changes (e.g. cancel racing ship) cannot both succeed.
