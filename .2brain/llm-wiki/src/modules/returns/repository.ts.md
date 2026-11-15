---
source: src/modules/returns/repository.ts
sha256: f8b05aeb1cafbdd6fc2a991092d1451ed26e56b890424ab7662a98cdf2b36562
generated_at: 2026-11-14T21:35:50.961540+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/repository.ts

## Purpose

Persistence layer for the Returns module. It exposes the generic CRUD surface (delegated to `createRepository`) plus the domain-specific operations the service layer needs: atomic status transitions, per-order reads, transactional locking, GDPR text scrubbing, and a stats aggregation. It exists so that services never touch Mongoose directly and so the two concurrency-sensitive primitives (`claimStatus`, `claimProof`) live in one place.

## Key elements

- **`ReturnStamp`** (type) — The set of fields a lifecycle move may write alongside its status change. Includes dotted paths for per-line `restocked` counts.
- **`returnRepository`** (object, main export) — The repository instance. Spreads generic CRUD (`createRepository<ReturnDocument, StoredReturn>(returnModel, …)`) and adds:
  - `claimStatus(id, from, to, stamp?, session?, where?)` — Conditional `findOneAndUpdate` guarded by a `$in` on `status`. Returns the updated doc or `null` if the status wasn't in `from`. This is the exactly-once mechanism for every lifecycle move.
  - `claimProof(id, stamp, session)` — Stamps proof-of-sending on an `approved` return that has no proof yet. Returns `null` on conflict or if already stamped.
  - `findByOrderId(orderId, session?)` — All returns for one order, sorted `createdAt` asc.
  - `lockOrder(orderId, session)` — Upserts a `returnOrderLockModel` row (`$inc: openings`). Two concurrent transactions on the same order conflict; the driver retries the loser.
  - `findByOrderIds(orderIds)` — Batch read for account exports.
  - `scrubFreeTextBefore(cutoff)` — `$unset`s `note` and `declineMessage` on returns unchanged since `cutoff`. Uses `timestamps: false` to avoid advancing `updatedAt` (the query's own filter clock). Idempotent on rerun.
  - `sumReceived<TRow>(window, group, productId?)` — Aggregation over `BACK_RETURN_STATUSES` within a `receivedAt` window, unwinds `lines`, applies caller-supplied `$group`. Used by reporting.

## Relationships

- **`@infrastructure/persistence/conditional-status`** — Provides `updateStatusIfIn`, the primitive both `claimStatus` and `claimProof` delegate to for their atomic conditional write.
- **`@infrastructure/persistence/create-repository`** — Supplies the generic CRUD base (find, getById, etc.) and the `toObjectId` helper, both spread into `returnRepository`.
- **`@infrastructure/persistence/report`** — Provides the `ReportWindow` type used by `sumReceived`.
- **`./model`** — Source of `returnModel` (the Mongoose model), `returnOrderLockModel` (the lock table), `applyReturnTransform` (document → `StoredReturn` mapper), and the `ReturnDocument` type.
- **`./domain`** — Source of `BACK_RETURN_STATUSES` (used in the `sumReceived` filter), `returnLifecycle` (used to derive the `from` set in `claimProof`), and the `ReturnStatus` type.
- **`./presenter`** — Source of the `StoredReturn` type that the generic CRUD's `transform` produces.
- **Services (`create`, `decide`, `close`, `cancel`, `cancel-remainder`, `digest`, `notify`, `options`)** — Each calls into `returnRepository` for its reads and writes; `decide`, `close`, `cancel`, and `cancel-remainder` drive status transitions through `claimStatus`; `digest` and `notify` read via `findByOrderId`/`claimProof`.

## Notes

- **Concurrency model:** `claimStatus` and `claimProof` rely on a single conditional `findOneAndUpdate` — there is no read-then-write. Two concurrent callers on the same return get exactly one non-`null` result. Services must treat `null` as "someone else moved first" and re-read or abort.
- **`lockOrder` is a no-op outside a transaction.** The upsert only creates contention when both callers pass a `session`. Callers that don't pass one get no mutual exclusion.
- **`scrubFreeTextBefore` is idempotent** but only for *new* text: if a return is edited after the cutoff, its text is preserved. The `timestamps: false` flag is load-bearing — without it the query would advance `updatedAt` and make the next run's `$lte` filter wrong.
- **`ReturnStamp` allows dotted paths** (`lines.${number}.restocked`), so callers can target a specific array element in the same atomic write. This is a Mongoose-specific feature; it won't work if the schema ever switches off Mongoose.
- The `searchable` config passed to `createRepository` declares which fields support `objectIds`, `exact`, and `sortable` lookups — the generic CRUD methods filter/sort on those keys.
