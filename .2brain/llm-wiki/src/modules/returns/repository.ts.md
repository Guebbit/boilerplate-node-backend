---
source: src/modules/returns/repository.ts
sha256: f2a9ba574bdc7f56742d079cacafcb4f5529fe42ba4bcc003598e68366132649
generated_at: 2026-11-08T08:01:11.039980+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/repository.ts

## Purpose

Persistence layer for the returns domain. Exposes the generic CRUD surface (via the shared `createRepository` factory) plus the two primitives every lifecycle service depends on: an atomic conditional status transition (`claimStatus`) and per-order reads needed for quantity checks and locking.

## Key elements

- **`ReturnStamp`** (exported type) — The set of document fields a lifecycle move may write in the same statement as a status change (e.g. `decidedAt`, `refundAmount`, `canceledAt`), including dotted-path entries like `` `lines.${number}.restocked` ``.
- **`returnRepository`** (exported const) — The repository object. Spreads the generic CRUD methods and adds:
  - `claimStatus(id, from, to, stamp?, session?)` — Atomic conditional write: `findOneAndUpdate` filtered on `_id` **and** `status ∈ from`. Exactly one concurrent caller wins; losers get `null`. Stamps are written in the same `$set`.
  - `findByOrderId(orderId, session?)` — All returns for one order, sorted `createdAt` asc, `_id` asc.
  - `lockOrder(orderId, session)` — Upserts a row in `returnOrderLockModel` (`$inc: { openings: 1 }`) inside the caller's transaction to serialise concurrent access to the same order's returns.
  - `findByOrderIds(orderIds)` — Batch variant of `findByOrderId` for the account-export read.
  - `scrubFreeTextBefore(cutoff)` — Unsets `note` and `declineMessage` on returns unchanged since `cutoff`; uses `timestamps: false` so the wipe doesn't invalidate its own `updatedAt` predicate. Returns modified count.
  - `sumReceived(window, group, productId?)` — Aggregation pipeline (`$match` on `receivedAt` window + `$unwind` lines + caller-supplied `$group`) for the stats/report endpoint.
- **Searchable metadata** passed to `createRepository` — declares `objectIds` (orderId), `exact` (status, reason), and `sortable` (createdAt, status) fields for the generic query builder.

## Relationships

- **`@infrastructure/persistence/conditional-status`** — Imports `updateStatusIfIn` (aliased `conditionalStatus`), the low-level helper that `claimStatus` delegates to.
- **`@infrastructure/persistence/create-repository`** — Imports `createRepository` (CRUD factory), `toObjectId`, and the `Repository` type that shapes the returned object.
- **`@infrastructure/persistence/report`** — Imports the `ReportWindow` type used by `sumReceived`.
- **`./model`** — Imports `returnModel` (Mongoose model), `returnOrderLockModel` (lock-row model), `applyReturnTransform` (document → `StoredReturn` mapper), and the `ReturnDocument` type.
- **`./domain`** — Imports the `ReturnStatus` union type used in `claimStatus` signatures.
- **`./presenter`** — Imports `StoredReturn` (the shape the generic CRUD layer returns to callers).
- **Services** (`cancel`, `close`, `create`, `decide`, `digest`, `notify`, `options`, `personal-data`, `cancel-remainder`) — Consumers that call `returnRepository` to perform reads, status transitions, and locking.

## Notes

- `claimStatus` does **not** do a read-then-write; the `$in` filter and the `$set` live in a single `findOneAndUpdate`, so concurrent decisions on the same return are resolved by the database (one writer wins, others get `null`).
- `lockOrder` is a no-op outside a transaction (it requires a `session` argument); the lock only has meaning when the driver can re-run the loser after the winner commits.
- `scrubFreeTextBefore` is idempotent: the `$or` guard ensures a second run matches zero documents.
- The `ReturnStamp` type allows arbitrary line-indexed keys (`` `lines.${number}.restocked` ``), so callers must supply the correct numeric index rather than a string.
