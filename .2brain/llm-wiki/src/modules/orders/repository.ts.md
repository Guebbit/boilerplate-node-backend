---
source: src/modules/orders/repository.ts
sha256: e61cd14d4dc2e4a58890782b514e3d78f3576b8cc7be3c8be2a2fd2368201f07
generated_at: 2026-09-23T19:05:31.716386+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/repository.ts

## Purpose

Data-access layer for orders. Because an order embeds a product snapshot (filtering on `items.product._id` is a pipeline concern, not a plain-query one), this repository overrides the factory's default `find`-based search with an aggregation-pipeline implementation while still using the factory for plain CRUD. It also concentrates every domain-specific atomic write (status transitions, pending-effect bookkeeping, scope-guarded reads) so that services never issue raw model calls.

## Key elements

- **`base`** — repository instance from `createRepository(orderModel, …)`. Supplies `findById`, `save`, `remove`, `buildWhere`, `normalize`, and a declared search spec (objectIds, exact, regex). The `productId` filter maps to the embedded path `items.product._id`.
- **`aggregate`** — thin wrapper around `orderModel.aggregate`; the single entry point for all pipeline queries.
- **`search`** — Filter → `$match` → `$sort` → `$count` / `$skip`+`$limit`. Merges caller `scope` last (authorization boundary). Returns `{ items: Order[], meta: PaginatedMeta }`.
- **`findByIdScoped(id, scope?)`** — Polymorphic: unscoped resolves a hydrated `OrderDocument`; scoped resolves the wire `Order`. Uses aggregation so the ownership scope applies inside the same query (no TOCTOU between read and check).
- **`ownerScope(userId)`** — Coerces a string `userId` to an ObjectId for use as a scope object.
- **`updateStatusIfIn(id, from, to, scope?, effects?)`** — Atomic `findOneAndUpdate` guarded by `status: { $in: from }`. Writes `pendingEffects` in the same `$set` when provided (single-document atomicity).
- **`applyStatusOverride(id, from, to, entry)`** — Status move + `$push` of a `statusOverrides` history entry in one write.
- **`findWithPendingEffects(cutoff, limit)`** — Orders whose `pendingEffects` array is non-empty and `updatedAt ≤ cutoff`, oldest first.
- **`findPendingByProductId(productId)`** — All `pending` orders containing a given embedded product (hard-delete / deactivation path).
- **`clearPendingEffect(orderId, effect)`** — Conditional `$pull`; idempotent (a racing retry gets `modifiedCount === 0`). `timestamps: false` so the sweep cutoff isn't invalidated.
- **`countOpenBankTransfers(userId)`** — Count of a user's `pending` / `bank_transfer` orders (checkout cap).
- **(truncated)** — An existence-check helper for the invoice-file reaper (`scripts/ops/reap-invoices.ts`), verifying which stored invoice IDs still name a live order.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — Supplies `createRepository`, `toObjectId`, and the `Repository` type. `base` is its return value; `buildWhere` and `normalize` are reused by `search` and `findByIdScoped`.
- **`src/infrastructure/persistence/search.ts`** — Supplies `normalizePagination`, `buildPaginatedMeta`, `DEFAULT_SORT`, and `PaginatedMeta`.
- **`src/modules/orders/model.ts`** — Supplies `orderModel`, `applyOrderTransform`, `invoiceCounterModel`, and the `OrderDocument` / `OrderPendingEffect` / `OrderStatusOverride` types.
- **`src/modules/orders/services/scope.ts`** — Provides `callerScope` objects that are spread into the `scope` parameter of `findByIdScoped`, `updateStatusIfIn`, and `search`.
- **`src/modules/orders/services/cancel.ts`** — Calls `updateStatusIfIn` with `effects` (cancellation consequences) and `scope`.
- **`src/modules/orders/services/override.ts`** — Calls `applyStatusOverride` to write a status move plus its history entry atomically.
- **`src/modules/orders/services/status.ts`** — Drives status transitions via `updateStatusIfIn`.
- **`src/modules/orders/services/place.ts`** — Calls `countOpenBankTransfers` before writing a new transfer order.
- **`src/modules/orders/services/retention.ts`** — Calls `findPendingByProductId` when a product is hard-deleted or deactivated.
- **`src/modules/orders/services/retract.ts`** — Likely uses `updateStatusIfIn` to move an order back to a prior status.
- **`src/modules/orders/services/crud.ts`** — Consumes `base` CRUD and `findByIdScoped` for list/get/create/update/delete.
- **`src/modules/orders/services/invoice.ts` / `invoice-numbering.ts`** — Use `orderModel` and `invoiceCounterModel` for invoice generation and sequential numbering.
- **`src/modules/orders/services/availability.ts`** — Queries order state (e.g., via `base` or `search`) to determine product availability for a cart.
- **`src/modules/cart/tests/integration/stock.test.ts`** — Integration test that exercises the full order-placement path, indirectly touching `createRepository` and the product-snapshot embedding this repository relies on.

## Notes

- **Embedded product, not a reference.** `items.product._id` is the snapshot's own `_id`, not a pointer into the catalogue. Any query that "finds orders for product X" must target that path; a `.ref`-style lookup will never match.
- **`$match` does not cast.** Unlike `find()`, a pipeline `$match` will not coerce a string to ObjectId. That is why `search` calls `base.buildWhere` (which performs `toObjectId`) before splicing the filter into the pipeline, and why the function is `async` — a bad id surfaces as a rejected promise, not an uncaught throw.
- **Sort tie-breaking.** `DEFAULT_SORT` (not a bare `createdAt`) is used so that the separate `$count` and `$skip/$limit` pipelines agree on ordering; orders arrive in bursts and equal timestamps are the norm.
- **Scope is an authorization boundary, merged last.** Client-supplied `filters` can never widen `scope`; the spread order in `search` and the filter composition in `updateStatusIfIn` enforce this.
- **`findByIdScoped` return type is a union.** Only `_id` (the virtual) is guaranteed on both branches; `.id` works on both, `.userId` etc. only on the unscoped `OrderDocument`. Callers that may receive a scoped result should treat the value as `Order`-shaped.
- **`clearPendingEffect` sets `timestamps: false`.** Bumping `updatedAt` on a drain would push *other* pending effects past the sweep cutoff, silently delaying their retry.
