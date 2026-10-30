---
source: src/modules/orders/services/timeline.ts
sha256: 5916d67a7ddd661198087e0febcdf94d62d2dea81ef464616108594dc95d5bc1
generated_at: 2026-10-29T04:50:42.791693+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/timeline.ts

## Purpose

Manages the append-only event log of an order: what happened to it, in order, readable by the buyer and by staff. It is the single write path for timeline rows — `orders` appends within its own transaction, while dependent modules (payments, delivery, returns, invoicing) call `appendTimeline` inside their own transaction. It also provides the read, export, scrub, and delete operations on those rows.

## Key elements

- **`appendTimeline`** — Appends one timeline row via `orderEventRepository.create` in the caller's `ClientSession`. Accepts `TimelineEntryInput` (type, optional actor/text, `data` codes).
- **`appendTimelineAll`** (private) — Appends an array of rows sequentially (no parallelism; session constraint + ordering guarantee).
- **`withTimeline`** — Curried wrapper: runs a conditional status write, and only if it matched does it append the rows built from the returned document. A lost race writes neither.
- **`readsEveryOrder`** (private) — Returns `true` when the caller's held rules include `display:Order` (checked via `heldRules`, not CASL action).
- **`readTimeline`** — Fetches events for one order and returns them presented for `'staff'` or `'buyer'` audience depending on `readsEveryOrder`.
- **`collectTimelineOf`** — Gathers all timeline rows across a user's own orders for `POST /account/export`. Uses `'buyer'` presentation but re-attaches `actor` when it equals the exporting user's id.
- **`clearTimelineActor`** — Nulls the `actor` field for a given user (GDPR erasure).
- **`scrubTimelineText`** — Unsets free-text on rows older than `orderEventTextRetentionDays`; logs the count.
- **`deleteTimelineOf`** — Hard-deletes all rows for an order. Marked `@internal`; only the module's own order-removal path may call it.

## Relationships

- **`src/modules/orders/repository.ts`** — All reads/writes go through `orderEventRepository` (`create`, `findByOrderId`, `findByOrderIds`, `clearActor`, `scrubTextBefore`, `deleteByOrderId`).
- **`src/modules/orders/presenter.ts`** — `presentTimeline` and `presentTimelineEntry` shape raw events into `OrderTimelineEntry[]` for a given audience.
- **`src/modules/orders/domain/index.ts`** — Supplies the `TimelineEntryInput` type that `appendTimeline` and `withTimeline` accept.
- **`src/modules/orders/config.ts`** — `orderEventTextRetentionDays` drives the retention window in `scrubTimelineText`.
- **`src/modules/orders/model.ts`** — `OrderDocument` is the return type of the write passed to `withTimeline`.
- **`src/domain-primitives/time.ts`** — `DAY_MS` constant used in the retention-date calculation.
- **`src/kernel/ability.ts`** — `heldRules` used by `readsEveryOrder` to check `display:Order`.
- **`src/kernel/permissions.ts`** — `callerForSubject` builds the subject for the ability check.
- **`src/infrastructure/adapters/logger.ts`** — `logger.info` in `scrubTimelineText`.
- **`src/infrastructure/persistence/create-repository.ts`** — `toObjectId` for casting the string `orderId`.
- **`src/modules/orders/jobs.ts`** — Caller of `scrubTimelineText` as the "second sweep" of `reap:orders`.
- **`src/modules/orders/services/cancel.ts`** — Expected consumer of `appendTimeline` / `withTimeline` within its own transaction.
- **`src/modules/orders/services/index.ts`** — Barrel re-export of this module's public API.

## Notes

- **No event listeners by design.** Dependent modules import `orders`, so `orders` cannot subscribe to their events (circular dependency). The "two writers, one door" pattern is the explicit alternative.
- **Sequential appends.** `appendTimelineAll` loops with `await`; a Mongoose session does not support parallel writes, and row order must match the input order.
- **Permission check uses `display:Order`, not `read:Order`.** The latter is a shared CASL action that buyers also hold; using it would leak staff-only rows.
- **Export includes staff text but hides third-party actors.** The export is the buyer's *data*, not their *screen*. The CJEU *Pankki S* (C-579/21) citation in the doc-comment records the rationale for retaining the row while masking the actor.
- **`data` field carries IDs/codes, never sibling free text.** Free text lives in the optional `text` field, which is the only thing `scrubTimelineText` removes.
- **`deleteTimelineOf` is `@internal`.** It is deliberately excluded from `orderService`'s public surface to prevent cross-module misuse.
