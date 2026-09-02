# src/modules/orders/repository.ts

## Purpose

Order data access layer built on top of the shared `createRepository` factory, but with `search` overridden to use Mongoose aggregation pipelines. This is necessary because orders embed a product snapshot (`items.product._id`) that plain `find()` cannot filter on, and because `$match` does not auto-cast ObjectIds the way `find()` does. The file also houses GDPR/anonymization primitives (`detachUserId`, `scrubDueForAnonymization`) and an atomic conditional status transition used by checkout and delivery flows.

## Key elements

- **`orderRepository`** (exported) — the composite object; extends the base CRUD with aggregation-aware `search`, `findByIdScoped`, `updateStatusIfIn`, `detachUserId`, `scrubDueForAnonymization`, `aggregate`, `ownerScope`, and `visibleScope`.
- **`base`** (internal) — result of `createRepository(orderModel, {…})`; supplies `findById`, `create`, `update`, `remove`, `buildWhere`, `normalize`, and the declared `searchable` spec (objectIds, exact, regex).
- **`search(filters?, scope?)`** — two-pipeline aggregation: `$match` → `$sort` → `$count`, then `$match` → `$sort` → `$skip` → `$limit`. Returns `{ items, meta }`.
- **`findByIdScoped(id, scope?)`** — single-order fetch; unscoped uses `base.findById`, scoped runs a one-element pipeline so ownership and read are in the same query.
- **`ownerScope(userId)`** — coerces a string id to `ObjectId` for use in a `$match` filter.
- **`visibleScope(userId)`** — composes `ownerScope` + `{ deletedAt: { $exists: false } }`; the standard non-admin read scope.
- **`updateStatusIfIn(id, from[], to, scope?)`** — atomic `findOneAndUpdate` with `status: { $in: from }` in the filter; the loser of a race gets `null`.
- **`detachUserId(userId, anonymizeAfter)`** — unsets `userId`, sets `anonymizeAfter` timestamp; called by the `USER_DELETED` listener.
- **`scrubDueForAnonymization(cutoff)`** — two sequential `updateMany` calls that replace `email`/`shippingAddress.fullName`/`.street` with placeholders, unset `shippingAddress.phone` and `anonymizeAfter`.
- **`aggregate<T>(pipeline)`** — thin wrapper over `orderModel.aggregate`.
- **`ANONYMIZED_EMAIL` / `ANONYMIZED_TEXT`** — placeholder constants for scrubbed PII.

## Relationships

- **`src/modules/orders/model.ts`** — provides `orderModel`, `applyOrderTransform`, and the `OrderDocument` type consumed throughout.
- **`src/infrastructure/persistence/create-repository.ts`** — provides `createRepository`, `toObjectId`, `Repository`, and `SearchFilters`; supplies the base CRUD and the `buildWhere`/`normalize` helpers this file delegates to.
- **`src/infrastructure/persistence/search.ts`** — provides `normalizePagination`, `buildPaginatedMeta`, `DEFAULT_SORT`, and `PaginatedMeta` used by `search`.
- **`src/modules/orders/service.ts`, `src/modules/cart/services/checkout.ts`, `src/modules/cart/services/reorder.ts`, `src/modules/delivery/service.ts`, `src/modules/account/services/export.ts`** — downstream consumers of the exported `orderRepository` (reads, status transitions, scoped lookups).
- **`src/modules/orders/index.ts`** — barrel re-export.
- **Test files** (`src/modules/delivery/tests/…`, `src/modules/cart/tests/…`, `src/modules/account/tests/…`) — exercise `search`, `updateStatusIfIn`, and scoped reads.

## Notes

- **Explicit type annotation on `orderRepository`** — Mongoose generics are too large for TS to infer at an export boundary (TS7056), so the `Omit<…> & {…}` shape is written out by hand.
- **`findByIdScoped` return is polymorphic** — unscoped resolves a hydrated Mongoose document; scoped resolves a plain object through `applyOrderTransform`. Only `.id` is guaranteed on both; `._id` is `undefined` on scoped results at runtime despite type-checking on `OrderDocument`.
- **Two separate `aggregate` calls in `search`** (count + page) — a tie on `createdAt` between the two calls can duplicate or skip a row, so `DEFAULT_SORT` (not bare `createdAt`) is used to break ties deterministically.
- **`scrubDueForAnonymization` uses two writes** — a single `$set` on `shippingAddress.*` sub-fields would *create* a partial document on orders that have no `shippingAddress` at all, introducing fields (`city`, `zip`, `country`) that no validator checks on a bulk update.
- **`visibleScope` uses `{ $exists: false }`**, not `{ deletedAt: null }` — `remove` unsets the key entirely, so a restored order has no `deletedAt` field at all.
- **`updateStatusIfIn` puts the `status: { $in }` condition in the filter**, not a preceding read, so mongod's per-document lock guarantees exactly one writer succeeds on a race.
