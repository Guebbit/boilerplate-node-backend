# src/modules/orders/repository.ts

## Purpose

Repository for the Order collection. Orders are read through the MongoDB aggregation pipeline (because embedded product snapshots make `find()` insufficient for cross-field filtering) while still inheriting plain CRUD from the shared repository factory. It adds scoped authorization, atomic status transitions, and pipeline-based search on top of that base.

## Key elements

- **`orderRepository`** (export) — The single public entry point. Extends the base `Repository<OrderDocument>` with `aggregate`, a custom `search`, `findByIdScoped`, `ownerScope`, `visibleScope`, and `updateStatusIfIn`.
- **`base`** (internal) — Result of `createRepository(orderModel, …)`. Supplies `findById`, `findOneAndUpdate`, `buildWhere`, `normalize`, and the standard CRUD verbs. Configures searchable fields including the embedded `items.product._id` path.
- **`aggregate`** (internal helper) — Thin wrapper around `orderModel.aggregate<T>(pipeline)` for use by `search` and `findByIdScoped`.
- **`search`** — Filter → count → page over two aggregation calls. Merges caller `scope` last so authorization can never be widened by client filters. Uses `DEFAULT_SORT` (compound) to avoid tie-breaking inconsistencies between the count and page queries.
- **`findByIdScoped`** — Polymorphic return: unscoped returns a hydrated Mongoose doc; scoped returns a plain normalized object. Routes through the pipeline so the read and the scope are one query.
- **`ownerScope(userId)`** — Coerces the userId string to an ObjectId and returns `{ userId }` for use as a scope.
- **`visibleScope(userId)`** — Composes `ownerScope` with `deletedAt: { $exists: false }` (soft-delete filter). This is the scope a non-admin caller must pass.
- **`updateStatusIfIn(id, from[], to, scope?)`** — Atomic conditional `findOneAndUpdate`: the `status: { $in: from }` guard rides in the filter, so concurrent callers race safely at the mongod level. Returns the post-update doc or `null`.
- **Type annotation for `orderRepository`** — Written out explicitly because Mongoose generics exceed TS's serialization limit (TS7056) at an export boundary.

## Relationships

- **`./model`** — Imports `orderModel` (the Mongoose model), `applyOrderTransform` (used as the `normalize`/`transform` callback), and the `OrderDocument` type.
- **`@infrastructure/persistence/create-repository`** — Imports the `createRepository` factory (base CRUD), `toObjectId` (id coercion), and the `SearchFilters` / `Repository` types.
- **`@infrastructure/persistence/search`** — Imports `normalizePagination`, `buildPaginatedMeta`, `DEFAULT_SORT`, and `PaginatedMeta` for pagination plumbing in `search`.
- **`./service`** — Primary consumer; passes `visibleScope` / `ownerScope` and calls `updateStatusIfIn` and `findByIdScoped`.
- **`../cart/services/checkout`** and **`../cart/services/reorder`** — Create orders through the base CRUD surface (`create`) exposed by `orderRepository`.
- **`../delivery/service`** — Calls `updateStatusIfIn` to advance delivery-related status transitions.
- **`./index`** — Re-exports `orderRepository` for module consumers.
- **Test files** (`tests/fixtures`, `tests/contract/…`, delivery & cart integration tests) — Exercise `search`, `findByIdScoped`, and `updateStatusIfIn` against a real or mocked Mongo.

## Notes

- **`$match` does not cast.** Unlike `find()`, a raw string id in a `$match` stage matches nothing. `toObjectId` must be applied *before* the pipeline is assembled; `buildWhere` does this synchronously, and `search` is `async` so a malformed-id throw surfaces as a rejection rather than bypassing a caller's `.catch()`.
- **`DEFAULT_SORT` is compound, not a bare `createdAt`.** The count and page are two separate `aggregate()` calls; without a deterministic sort, a tie can duplicate an order across pages or skip one entirely. Orders arrive in bursts, making ties the normal case.
- **`findByIdScoped` return is polymorphic.** Unscoped → hydrated Mongoose doc; scoped → plain object through `applyOrderTransform`. Both serialize identically, but only `id` is guaranteed on both. `_id` type-checks as present on `OrderDocument` yet is `undefined` at runtime for the scoped path — TypeScript will not catch this.
- **`$exists: false`, not `null`.** `remove` unsets `deletedAt` to restore an order, so a restored order simply lacks the key. A `null` check would incorrectly hide restored orders.
- **Scope is merged last in `search`.** `{ ...base.buildWhere(filters), ...scope }` ensures no client-supplied filter can override the authorization boundary.
- **`updateStatusIfIn` guard is in the filter, not a pre-read.** Two racing requests (e.g. customer cancel + admin ship) both evaluate `status: { $in: from }` atomically under mongod's document lock; exactly one wins.
