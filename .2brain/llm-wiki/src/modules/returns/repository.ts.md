---
source: src/modules/returns/repository.ts
sha256: 00461cde4095e285ddd5e89b34d38ad1cc895237a6c9ff6ad4c544b7082d2c57
generated_at: 2026-10-15T11:54:45.978632+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/repository.ts

## Purpose

Persistence layer for the Returns module. Wraps the shared Mongoose `createRepository` generic CRUD with three domain-specific primitives: `claimStatus` (the conditional, exactly-once status transition that guards every lifecycle move), `lockOrder` (a per-order advisory lock row for concurrent transaction safety), and `findByOrderId` (the read the quantity check depends on). Also hosts the stats aggregation and the GDPR text-scrub job.

## Key elements

- **`ReturnStamp`** (type) — `Partial<Pick<…>>` over the seven fields a lifecycle move may write atomically alongside the new status (`declineReason`, `decidedAt`, `receivedAt`, `handlingDeduction`, `refundAmount`, `shippingRefund`, `closedAt`).
- **`returnRepository`** (const, exported) — the sole public export. Spreads the result of `createRepository<ReturnDocument, Return>(returnModel, …)` (providing `find`, `insert`, `update`, `delete`, `findOne`, etc.) and adds:
  - `claimStatus(id, from[], to, stamp?, session?)` — `findOneAndUpdate` with `status: { $in: from }` in the filter; the loser of a concurrent race receives `null`.
  - `findByOrderId(orderId, session?)` — all returns for one order, oldest-first.
  - `lockOrder(orderId, session)` — upserts a row in `returnOrderLockModel` (`$inc: { openings: 1 }`) inside the caller's transaction to serialize concurrent writes on the same order.
  - `findByOrderIds(orderIds)` — bulk variant for the account-export read.
  - `scrubFreeTextBefore(cutoff)` — `$unset`s `note` and `declineReason` on stale returns; idempotent because the filter requires the fields to exist.
  - `sumReceived<T>(window, group, productId?)` — aggregation pipeline (`$match` → `$unwind` → optional product filter → caller-supplied `$group`) for the stats service.
- **`createRepository` configuration** — `transform: applyReturnTransform`; searchable indexes on `orderId` (ObjectId) and exact-match on `status` / `reason`.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — provides `createRepository`, `toObjectId`, and the `Repository` interface that `returnRepository` extends.
- **`src/infrastructure/persistence/report.ts`** — exports the `ReportWindow` type used by `sumReceived`.
- **`src/modules/returns/model.ts`** — source of `returnModel`, `returnOrderLockModel`, `applyReturnTransform`, and the `ReturnDocument` type.
- **`src/modules/returns/domain/index.ts`** — provides the `ReturnStatus` union used in `claimStatus` and `sumReceived` filters.
- **Services (`decide`, `close`, `receive`, `cancel-remainder`, `create`, `retention`, `read`, `stats`, `personal-data`, `options`, `projection`)** — all import `returnRepository` and call it (directly or through their service functions) to perform reads, status transitions, locks, and aggregations.

## Notes

- `claimStatus` is the **only** way a return's `status` field should change; the `$in` filter is what makes concurrent decisions safe—do not add a separate `findById` + `save` path.
- `lockOrder` is a no-op outside a `ClientSession`; it must always be called inside a transaction.
- `scrubFreeTextBefore` passes `{ timestamps: false }` so the `$unset` does not bump `updatedAt`, which is the same field the query filters on—reruns are naturally no-ops.
- `sumReceived` accepts a caller-supplied `$group` body, so the shape of the result is entirely determined by the stats service; this file performs no grouping logic of its own.
- `findByOrderId` and `findByOrderIds` both sort `{ createdAt: 1, _id: 1 }`; the `_id` tiebreaker is the insertion-order guarantee for documents sharing a millisecond timestamp.
