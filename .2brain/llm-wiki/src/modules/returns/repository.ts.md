---
source: src/modules/returns/repository.ts
source_sha256: 236b21bc0b5d690a8699cdb73fa9c586b204870582a88fbe1af6b53d19037ff3
context_sha256: 3a481681420fa8acf7b6204c974d63327aeb04c852175fd71d1f9853a7db46af
generated_at: 2026-11-22T07:27:11.424213+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/repository.ts

## Purpose
Persistence layer for returns. It exposes the generic CRUD repository for the return model, plus the specialised primitives the returns services use to drive lifecycle moves safely: an atomic conditional status write, per-order reads, an order-level lock, a stats aggregation, and a free-text scrub.

## Key elements
- **`ReturnStamp`** (type): the fields a lifecycle move may set in the same write as its status (decline reason/message, decided/received/closed/canceled timestamps, remedy, handling deduction, refund amounts, proof-of-sending fields, shipping refund). Also allows a per-line `restocked` value, set by line position as a dotted path.
- **`returnRepository`**: `createRepository(...)` spread (with `applyReturnTransform`, searchable `orderId`/`status`/`reason`, sortable `createdAt`/`status`) plus these extras:
  - **`claimStatus(id, from, to, stamp?, session?, where?)`**: moves a return between statuses only if it is currently in one of `from`; the `$in` condition is in the write filter, so concurrent deciders race in the database and the loser gets `null`. Stamps facts in the same statement; extra `where` conditions are merged into the filter.
  - **`claimProof(id, stamp, session)`**: stamps proof of sending on a return with no `proofOfSendingAt` yet. Allowed from the statuses `returnLifecycle.fromOf('receive')`, and the status is written as `approved`. Returns `null` if the guard fails.
  - **`findByOrderId(orderId, session?)`**: all returns for one order, oldest first (`createdAt`, `_id`).
  - **`lockOrder(orderId, session)`**: upserts and increments a row in `returnOrderLockModel` so concurrent transactions on the same order conflict on the write and the loser is retried by the driver.
  - **`findByOrderIds(orderIds)`**: returns across many orders, oldest first (used for the account export, per the doc comment).
  - **`sumReceived(window, group, productId?)`**: aggregation over returns in `BACK_RETURN_STATUSES` with `receivedAt` in `[from, to)`, unwinds `lines`, optionally filters by product, then applies the caller's `$group` body.
  - **`scrubFreeTextBefore(cutoff)`**: unsets `note` and `declineMessage` on returns with `updatedAt <= cutoff` that still hold text; returns the modified count.

## Relationships
- Uses `infrastructure/persistence/conditional-status` (`updateStatusIfIn`) as the engine behind `claimStatus` and `claimProof`.
- Uses `infrastructure/persistence/create-repository` for the base CRUD repository, the `Repository` type and `toObjectId`.
- Uses `infrastructure/persistence/report` for the `ReportWindow` type in `sumReceived`.
- Uses `./model` for `returnModel`, `returnOrderLockModel`, `applyReturnTransform` and the `ReturnDocument` type.
- Uses `./domain` for `BACK_RETURN_STATUSES`, `returnLifecycle` and `ReturnStatus`.
- Uses `./presenter` for the `StoredReturn` type.
- The services in `./services/` (cancel, cancel-remainder, close, create, decide, digest, notify, options) are neighbors in the graph; this file's own header says the service drives lifecycle moves through `claimStatus`, though the file does not show which service calls which method.

## Notes
- `claimProof` is a stamp guarded by the receive window rather than a status move; the status stays `approved`.
- `lockOrder` only works inside a transaction; the lock is meaningless without a session.
- `scrubFreeTextBefore` passes `timestamps: false` so the wipe does not change `updatedAt`, the field the query filters on. It is idempotent because the filter only matches returns that still hold text.
- `claimStatus` returns `null` on a lost race or wrong starting status; callers must handle that result.
