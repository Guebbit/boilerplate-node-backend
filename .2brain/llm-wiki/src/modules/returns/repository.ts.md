---
source: src/modules/returns/repository.ts
sha256: f2a9ba574bdc7f56742d079cacafcb4f5529fe42ba4bcc003598e68366132649
generated_at: 2026-10-29T05:40:18.371532+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/repository.ts

## Purpose

The persistence boundary for the returns module. It exposes a generic CRUD surface (built on `createRepository`) plus the two primitives every service uses to drive lifecycle transitions: `claimStatus` (an atomic, conditional status write) and the per-order reads that quantity checks, locking, and reports depend on.

## Key elements

- **`ReturnStamp`** — type describing the optional fields a lifecycle move may stamp in the same `$set` as its new status (e.g. `declineReason`, `refundAmount`, per-line `restocked`).
- **`returnRepository`** — the single exported object. Spreads the generic `Repository<ReturnDocument, StoredReturn>` from `createRepository` and adds:
  - `claimStatus(id, from, to, stamp?, session?)` — conditional write: only updates if the current status is in `from`; returns `null` on the losing race.
  - `findByOrderId(orderId, session?)` — all returns for one order, oldest-first.
  - `lockOrder(orderId, session)` — upserts a row in `returnOrderLockModel` to create a write-conflict lock within a transaction.
  - `findByOrderIds(orderIds)` — returns across multiple orders (account export).
  - `scrubFreeTextBefore(cutoff)` — `$unset`s `note`/`declineMessage` on stale returns; returns modified count.
  - `sumReceived<TRow>(window, group, productId?)` — aggregation pipeline that unwinds lines and applies a caller-supplied `$group` for reporting.

## Relationships

- **`@infrastructure/persistence/conditional-status`** — `claimStatus` delegates to its `updateStatusIfIn` function.
- **`@infrastructure/persistence/create-repository`** — provides the `createRepository` factory, `toObjectId` helper, and the `Repository` interface that `returnRepository` extends.
- **`@infrastructure/persistence/report`** — supplies the `ReportWindow` type consumed by `sumReceived`.
- **`./model`** — provides `returnModel`, `returnOrderLockModel`, `applyReturnTransform`, and the `ReturnDocument` type.
- **`./domain`** — supplies the `ReturnStatus` union used in `claimStatus` signatures.
- **`./presenter`** — supplies the `StoredReturn` type for the generic repository's read transform.
- **Services (`create`, `decide`, `close`, `cancel`, `cancel-remainder`, `notify`, `digest`, `options`, `personal-data`)** — import `returnRepository` to perform their reads and writes; `claimStatus` and `lockOrder` are the entry points for every state transition.

## Notes

- `claimStatus` embeds the `$in` check in the filter (not a preceding read), so concurrent decisions resolve in the database—exactly one write matches, the rest get `null`. No application-level retry is expected.
- `lockOrder` is only meaningful inside a `ClientSession`; calling it outside a transaction creates the upsert row but provides no mutual exclusion.
- `scrubFreeTextBefore` passes `timestamps: false` so the `$unset` does not advance `updatedAt`, the very field the query filters on—preventing an infinite re-match on rerun.
- `sumReceived` includes both `received` and `closed` statuses, since both represent goods that physically came back.
- `findByOrderId` and `findByOrderIds` sort by `{ createdAt: 1, _id: 1 }` to guarantee a stable order even for returns created in the same millisecond.
