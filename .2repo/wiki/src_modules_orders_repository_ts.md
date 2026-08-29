# src/modules/orders/repository.ts

## Purpose

Order data access layer. Orders embed a product snapshot (not a reference), so filtering and searching go through Mongoose's aggregation pipeline rather than the base repository's `find()`-based path. This file extends the shared base repository with an aggregation-powered `search`, a scope-aware single-document read, a composite visibility scope, and an atomic conditional status transition.

## Key elements

- **`base`** — instance from `createBaseRepository(orderModel, …)`. Supplies CRUD (`findById`, `create`, `remove`, etc.), the `buildWhere` helper, and the `normalize` transform (`applyOrderTransform`). Searchable spec maps `productId` to the embedded path `items.product._id`.
- **`aggregate`** — thin wrapper over `orderModel.aggregate` for arbitrary pipelines.
- **`search`** — filter → `$match` → `$sort: DEFAULT_SORT` → count, then a second pipeline with `$skip`/`$limit`. Accepts an optional `scope` (authorization) merged last so it cannot be widened by client filters. Returns `{ items, meta }`.
- **`findByIdScoped`** — fetches one order. Unscoped → hydrated Mongoose doc (mutable, `save()`-able). Scoped → single aggregate row passed through `normalize` (plain object). Both serialize identically on the wire.
- **`ownerScope`** — `{ userId: toObjectId(userId) }`; coerces the caller's id so it matches the stored ObjectId.
- **`visibleScope`** — `ownerScope` + `deletedAt: { $exists: false }`; the row-level visibility rule for non-admin callers.
- **`updateStatusIfIn`** — `findOneAndUpdate` with `status: { $in: from }` **in the filter**, so the read-and-write is atomic. Scope rides in the same filter; there is no separate ownership check.
- **`orderRepository`** (export) — spread of `base` plus the five functions above. Typed explicitly (not inferred) because Mongoose generics trigger TS7056 at the export boundary.

## Relationships

- **`src/infrastructure/persistence/base-repository.ts`** — source of `createBaseRepository`, `toObjectId`, `SearchFilters`, `BaseRepository`. Provides the CRUD contract and the `buildWhere`/`normalize` helpers used throughout.
- **`src/infrastructure/persistence/search.ts`** — source of `normalizePagination`, `buildPaginatedMeta`, `DEFAULT_SORT`, `PaginatedMeta`.
- **`src/modules/orders/model.ts`** — provides `orderModel` (Mongoose model), `applyOrderTransform` (the document→wire serializer), and the `OrderDocument` type.
- **`src/modules/orders/service.ts`** — primary consumer; calls `orderRepository` methods to handle order reads, status changes, and listings.
- **`src/modules/orders/domain/lifecycle.ts`** — defines the valid status transitions that `updateStatusIfIn` enforces via its `from` array.
- **`src/modules/cart/services/checkout.ts`** / **`reorder.ts`** — create orders through the service and rely on the repository's `search`/`visibleScope` for post-checkout reads.
- **`src/modules/delivery/service.ts`** — reads orders (likely `findByIdScoped` with no scope for admin, or `visibleScope` for owner) and calls `updateStatusIfIn` for shipping-status transitions.
- **`src/modules/orders/index.ts`** — barrel re-export of `orderRepository`.
- **Test files** (`cart/tests/integration/*`, `delivery/tests/*`, `orders/tests/contract/*`) — exercise the repository through the service layer, covering scoped reads, pagination, and status-transition concurrency.

## Notes

- **Use `id`, never `_id`, when reading a result.** `findByIdScoped` returns either a hydrated doc (where `_id` exists) or a plain transformed object (where `_id` has been deleted). `OrderDocument extends Document`, so `_id` type-checks in both cases, but at runtime it is `undefined` on the scoped branch. The safe identifier is the virtual/transformed `id` in both shapes.
- **`$match` does not cast.** Unlike `find()`, the aggregation `$match` stage will not auto-coerce a string to an ObjectId. All id coercion goes through `toObjectId` before the pipeline is assembled (see `buildWhere` and `ownerScope`).
- **`DEFAULT_SORT` is required, not optional.** The count and the page are two separate `aggregate` calls; without a deterministic sort, an order that ties can appear on two pages simultaneously. Orders arrive in bursts (seeds, bulk imports, concurrent checkouts), making ties the norm.
- **`$exists: false` for `deletedAt`, not `null`.** The `remove` method unsets the field to restore, so a live order has no `deletedAt` key at all.
- **`search` is intentionally narrower than the base signature.** It does not accept a caller-supplied sort; the pipeline fixes it. That is why the export type omits the base `search` and redeclares it.
- **The `async` on `search` is load-bearing.** `buildWhere` can throw synchronously on a malformed id; without `async`, a typed `Promise<T>` would throw instead of reject, bypassing the caller's `.catch()` and surfacing as a 500 instead of a 422.
