---
source: src/modules/delivery/repository.ts
sha256: aed3800754559730b6027d22bf8c3d863e7c630bfa5d48aa4e2f7f3e2d18c93c
generated_at: 2026-10-14T15:25:16.751068+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/repository.ts

## Purpose
The persistence layer for the delivery module. It wraps the two Mongoose collections (fulfillment orders and shipments) behind a typed repository object, exposing the conditional reads and optimistic-concurrency writes that every delivery "act" (fulfill, cut, hold, notice, board) drives through. Return types are written out explicitly to sidestep Mongoose generics that TypeScript cannot serialize at an export boundary (TS7056).

## Key elements
- **`BoardFilters`** (interface) — the filter shape the preorder board accepts: `preorder`, `state`, `productId`, `late`, `dueWithin`, `orderIds`.
- **`ProductSummaryRow`** (interface) — one aggregated row per product: paid, waiting, awaiting-yes, allocated, shipped, cancelled, late counts.
- **`FulfillmentOrderPatch`** (type) — the subset of document fields an act may mutate, plus an optional `unset` array for fields to remove (hold reason, consent deadline, etc.).
- **`fulfillmentOrderRepository`** (const) — the main export. Spreads `createRepository` (generic CRUD) and adds domain-specific methods:
  - `findByOrderId` / `findByOrderIds` / `findInSession` — scoped reads, optionally bound to a Mongoose `ClientSession`.
  - `insertIfAbsent` — idempotent upsert keyed on `{ orderId, number }`; returns `true` only when it created the document.
  - `claim` — optimistic-concurrency write: matches on `_id` **and** the caller's `revision`, applies `$set`/`$unset`/`$inc revision`, returns the updated doc or `null` on conflict.
  - `scrubHoldNotesBefore` — bulk-delete stale hold notes older than a cutoff.
  - `findWaitingForProduct` — all on-hold/awaiting-stock orders for a given product line (served by a composite index).
  - `findDatePassed` / `findWaitsExpired` — the two sweep queries for overdue dates and expired consent waits.
  - `searchBoard` — paginated board read honouring `BoardFilters` ANDed together.
  - `summarizeProducts` — paginated aggregation producing `ProductSummaryRow[]`.
- **`stateCondition`** (private) — maps a `PreorderFulfillmentState` to its Mongo `QueryFilter`; kept in manual sync with `boardStateOf` in `./domain`.
- **`boardWhere`** (private) — assembles the `$and` array from `BoardFilters` + a `now` timestamp.
- **`DAY_MS`** (private const) — 86 400 000, used by `dueWithin`.

## Relationships
- **`create-repository.ts`** — supplies the `createRepository` factory (generic find/insert/update/delete), the `toObjectId` helper, and the `Repository` / `Wire` types that this file extends.
- **`./model`** — provides `fulfillmentOrderModel`, `shipmentModel`, the two `apply…Transform` functions, and the `FulfillmentOrderDocument` / `ShipmentDocument` types used throughout.
- **`./domain` (`domain/index.ts`, `domain/fulfillment.ts`)** — source of the `FulfillmentOrderDraft` type consumed by `insertIfAbsent`, and the `PreorderFulfillmentState` / `FulfillmentOrderStatus` / `FulfillmentHoldReason` / `FulfillmentConsent` enums used in query filters.
- **`services/ensure.ts`** — calls `insertIfAbsent` to make "create on payment" idempotent.
- **`services/fulfill.ts`, `services/cut.ts`, `services/cancel-remainder.ts`, `services/confirm-wait.ts`, `services/holds.ts`** — each reads via `findInSession` / `findByOrderId` then writes via `claim` inside a transaction.
- **`services/notice.ts`** — uses `findDatePassed` and `findWaitsExpired` for its sweep loop.
- **`services/board.ts`** — calls `searchBoard` and `summarizeProducts` for the preorder board view.
- **`services/override-sync.ts`** — queries `findWaitingForProduct` to locate orders affected by a release-date change.
- **`presenter.ts`** — consumes the repository's typed results to shape API responses.

## Notes
- **Optimistic concurrency is the only write path for mutations.** Every mutating act reads a `revision`, then calls `claim` with that revision. Two racing acts on the same fulfillment order cannot both succeed; the loser receives `null` and must re-read.
- **`stateCondition` and `boardStateOf` (in `./domain`) must stay in sync by hand.** The preorder board's integration suite asserts they agree; there is no shared constant between them.
- **`insertIfAbsent` uses `$setOnInsert` with upsert**, so it never overwrites an existing document. The boolean return lets a caller narrate a "birth" exactly once across retries.
- **Session handling is per-call.** Reads and writes accept an optional `ClientSession`; callers that participate in a transaction must pass it explicitly. `findByOrderIds` is the one read that does *not* accept a session (it is used outside a transaction for account export).
- **`FulfillmentOrderPatch.unset`** is a fixed union (`'holdReason' | 'holdNote' | 'consentDeadline'`); adding a new removable field requires updating both the type and the `$unset` logic in `claim`.
