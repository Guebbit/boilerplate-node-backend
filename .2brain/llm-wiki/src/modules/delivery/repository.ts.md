---
source: src/modules/delivery/repository.ts
sha256: 2cd40906d1f176a43d21856f513e15638abb60edeeb0811508188f2031531233
generated_at: 2026-10-29T03:36:44.155566+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/repository.ts

## Purpose

The persistence layer for the delivery module. It wires the two Mongoose collections (fulfillment orders, shipments) to the rest of the module and defines the conditional, revision-guarded writes through which every delivery act mutates state. It also builds the Mongo query filters behind the preorder board's reads and product summaries.

## Key elements

- **`BoardFilters`** — interface describing the optional filters (cause, state, productId, late, dueWithin, orderIds) a board read applies.
- **`ProductSummaryRow`** — shape of one aggregated product row returned by `summarizeProducts`.
- **`stateCondition`** *(private)* — maps a `PreorderFulfillmentState` to a `QueryFilter<FulfillmentOrderDocument>`.
- **`boardWhere`** *(private)* — ANDs all applicable `BoardFilters` clauses (including time-based `late` / `dueWithin`) into a single query filter.
- **`FulfillmentOrderPatch`** — the settable/unsettable fields an act may write in a single `claim`; the `unset` array names fields to remove (e.g. released hold reasons).
- **`fulfillmentOrderRepository`** — the main export. Extends the shared `Repository` with:
  - `findByOrderId` / `findByOrderIds` / `findInSession` — read paths (single order, batch, transaction-scoped).
  - `insertIfAbsent` — idempotent create via `$setOnInsert` + `upsert`; returns `true` only on a fresh insert so callers can narrate a birth exactly once.
  - `claim` — optimistic-concurrency write: matches on `(id, revision)`, increments revision, applies `$set`/`$unset`; returns `null` if a concurrent act moved the document.
  - `scrubHoldNotesBefore` — deletes stale hold-note text past a cutoff.
  - `findWaitingForProduct` — all on-hold/awaiting-stock fulfillment orders for a given product + cause.
  - `findDatePassed` — fulfillment orders whose `expectedAt` has passed.
  - `searchBoard` — paginated board read using `boardWhere`.
  - `summarizeProducts` — paginated aggregation producing `ProductSummaryRow[]`.

## Relationships

- **`./model`** — imports `fulfillmentOrderModel`, `shipmentModel`, and the document transforms (`applyFulfillmentOrderTransform`, `applyShipmentTransform`) that shape every read.
- **`./domain` (index / `fulfillment.ts`)** — imports `DUE_NOTICE_LEAD_MS`, `FulfillmentOrderDraft`, and `WaitCause` used in `insertIfAbsent` and `findWaitingForProduct`.
- **`@infrastructure/persistence/create-repository`** — imports `createRepository`, `toObjectId`, and the `Repository` / `Wire` types that provide the shared CRUD surface spread into `fulfillmentOrderRepository`.
- **`@infrastructure/persistence/conditional-status`** — imports `updateStatusIfAs` as `conditionalStatus` for guarded status transitions.
- **`@infrastructure/security/reencrypt`** — imports `reencryptOf`, `ReencryptSpec`, `ReencryptReport` (used in the truncated portion for shipment re-encryption).
- **`@domain-primitives/time`** — imports `DAY_MS` to compute the `dueWithin` window in `boardWhere`.
- **`services/act.ts`, `services/board.ts`, `services/cut.ts`, `services/deliver.ts`, `services/cancel-remainder.ts`, `services/ensure.ts`, `services/digest.ts`** — downstream consumers that call the repository's reads, `insertIfAbsent`, and `claim` to execute each delivery act.
- **`presenter.ts`** — maps repository documents into presentable output for API/queue consumers.

## Notes

- Return types on `fulfillmentOrderRepository` are written out explicitly; Mongoose's inferred generics exceed TypeScript's serialization limit at export boundaries (TS7056). The same constraint motivated the `Repository` type alias in `create-repository`.
- `stateCondition` must stay manually in sync with `boardStateOf` in `./domain`. The preorder-board integration suite asserts the two agree; there is no shared source of truth.
- The `cause === 'preorder'` filter uses `cause: { $ne: 'backorder' }` rather than `cause: 'preorder'` because preorders created before the backorder feature shipped carry no `cause` field at all.
- `claim` is the sole write path for fulfillment-order mutations in an act. A concurrent act that already incremented the revision will cause the loser's `findOneAndUpdate` to match zero documents, returning `null`—callers must handle that case.
- `insertIfAbsent` keys on the compound `{ orderId, number }`; the `$setOnInsert` pattern means a retried event-bus delivery or a racing read will never overwrite an existing document.
