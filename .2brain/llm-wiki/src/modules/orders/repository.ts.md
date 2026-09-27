---
source: src/modules/orders/repository.ts
sha256: feddc41e3bd4c405546cb1edb8c1d30707e16d684620297fef891543f8b44a72
generated_at: 2026-09-27T15:12:21.821181+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/repository.ts

## Purpose

The data-access layer for orders. Unlike other collections, orders embed a product snapshot, so reads go through the MongoDB aggregation pipeline rather than a simple `find()`. The file wires a base CRUD repository (from the shared factory) together with an aggregation-based `search`, scoped single-row reads, atomic status transitions, and a small pending-effects subsystem used by the retry sweep.

## Key elements

- **`base`** — the repository instance returned by `createRepository(orderModel, …)`. Declares the searchable spec (objectIds on `id`, `userId`, `productId` → `items.product._id`; exact on `email`, `status`, `paymentMethod`; regex on `notes`; presence on `deletedAt`). Its `search` method is overridden below.
- **`aggregate<T>(pipeline)`** — thin wrapper around `orderModel.aggregate`.
- **`withNormalizedEmailFilter(filters)`** — normalises a string `email` filter via `normalizeEmail` before it enters a `$match` stage (which, unlike `find()`, does not run schema casters).
- **`search(filters?, scope?)`** — aggregation-based paginated search. Builds `$match` from `base.buildWhere` + `scope` (scope merged last as the authorization boundary), then runs two separate `aggregate` calls (count, then page) sharing `DEFAULT_SORT` to avoid tie-induced page duplication.
- **`findByIdScoped(id, scope?)`** — single-row read; `scope` is spread into the same `findOne` filter so ownership is enforced in-query, not post-read.
- **`ownerScope(userId)`** — coerces a user id to ObjectId for use as a scope object.
- **`updateStatusIfIn(id, from, to, scope?, effects?)`** — atomic conditional status move via `findOneAndUpdate`; the `from` statuses ride in the `$in` filter so concurrent racers serialize on the document. Optionally stores `pendingEffects` in the same write.
- **`applyStatusOverride(id, from, to, entry)`** — same atomic pattern but appends a `statusOverrides` history entry with `$push` in the same write.
- **`findWithPendingEffects(cutoff, limit)`** — returns orders still owing a retry effect (non-empty `pendingEffects`, `updatedAt ≤ cutoff`), oldest first, bounded by `limit`.
- **`findPendingByProductId(productId)`** — all `pending` orders containing a line for the given product; used by hard-delete / deactivation to cancel them proactively.
- **`clearPendingEffect(orderId, effect)`** — conditional `$pull` of one effect; uses `timestamps: false` so draining doesn't push other effects past the sweep cutoff.
- **`addPendingEffect(orderId, effect)`** — `$addToSet` an effect outside a status transition (settlement refund path); timestamps run normally.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — supplies the `createRepository` factory, the `toObjectId` helper, and the `Repository` type. `base` is its return value; `base.buildWhere` and `base.normalize` are reused by `search`.
- **`src/infrastructure/persistence/normalize-email.ts`** — `normalizeEmail` is applied inside `withNormalizedEmailFilter` so that a `$match` on `email` matches the same way the schema caster would.
- **`src/infrastructure/persistence/search.ts`** — provides `normalizePagination`, `buildPaginatedMeta`, `DEFAULT_SORT`, and the `PaginatedMeta` type consumed by `search`.
- **`src/modules/orders/model.ts`** — exports `orderModel` (the Mongoose model), `applyOrderTransform` (the document→entity mapper passed to the factory), `orderNumberCounterModel`, and the `OrderDocument` / `OrderPendingEffect` / `OrderStatusOverride` types.
- **`src/modules/orders/services/scope.ts`** — builds the `callerScope` objects that callers spread into `findByIdScoped`, `updateStatusIfIn`, etc.
- **`src/modules/orders/services/cancel.ts`** — calls `updateStatusIfIn` (with `effects`) and `clearPendingEffect` / `addPendingEffect`.
- **`src/modules/orders/services/override.ts`** — calls `applyStatusOverride`.
- **`src/modules/orders/services/place.ts`** — consumes the base CRUD (`create`) and `findByIdScoped`.
- **`src/modules/orders/services/crud.ts`** — uses `base` for standard list/get/update/delete.
- **`src/modules/orders/services/availability.ts`** — queries `findPendingByProductId` to check open demand before allowing stock changes.
- **`src/modules/orders/services/retract.ts` / `retention.ts` / `invoice.ts` / `order-numbering.ts`** — call into the base repository or the status/effect helpers as part of their domain flows.
- **`src/modules/cart/tests/integration/stock.test.ts`** — exercises `findPendingByProductId` and the status-transition path end-to-end.

## Notes

- **`$match` does not cast.** Every filter that goes into the aggregation pipeline must be pre-coerced (ObjectIds via `toObjectId`, emails via `normalizeEmail`). `find()` would cast automatically; the pipeline does not.
- **Scope is merged last** in both `search` and `findByIdScoped`. A client-supplied filter can never widen the authorization boundary.
- **Status transitions are atomic** (`findOneAndUpdate` with `$in` on the `from` set). The condition lives in the filter, not a preceding read, so two concurrent writers serialize on the document and only one succeeds.
- **`DEFAULT_SORT` (not a bare field)** is required in the pipeline because count and page are two separate `aggregate` calls; a tie between them would otherwise place an order on two pages or skip one.
- **`timestamps: false`** on `clearPendingEffect` is deliberate: bumping `updatedAt` would push sibling effects past the sweep's `cutoff` and delay their own retry.
- **`productId` maps to `items.product._id`**, not a top-level field. Orders embed a product snapshot; there is no reference to the catalogue.
