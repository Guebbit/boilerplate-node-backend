---
source: src/modules/delivery/repository.ts
sha256: ba4cf10cfdcf0d24e987fb70508ce221d198341dd2bbeecba53c030d562294d0
generated_at: 2026-11-14T19:42:41.657655+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/repository.ts

## Purpose

Persistence layer for the delivery module. It wires the two Mongoose collections (fulfillment orders, shipments) to the act/services above them, providing the reads, optimistic-concurrency writes (`claim`), idempotent inserts, board search, and product summarisation that every delivery act is driven through.

## Key elements

- **`BoardFilters`** (exported interface) — parameter shape for the preorder board query: cause, state, product, late flag, due-within window, and order scoping.
- **`ProductSummaryRow`** (exported interface) — one row of the per-product aggregation returned by `summarizeProducts`.
- **`stateCondition`** (private) — maps a `PreorderFulfillmentState` to the Mongo `QueryFilter` that represents it.
- **`boardWhere`** (private) — assembles all filter clauses (cause, state, product, late, dueWithin, orderIds) into a single `$and`-wrapped query, evaluated against a supplied `now`.
- **`FulfillmentOrderPatch`** (exported type) — the settable fields plus an `unset` array that an act may include in a `claim` write.
- **`fulfillmentOrderRepository`** (exported const) — the primary repository object. Spreads the generic CRUD from `createRepository` and adds domain-specific operations: `findByOrderId`, `findByOrderIds`, `findInSession`, `insertIfAbsent`, `claim`, `scrubHoldNotesBefore`, `findWaitingForProduct`, `findDatePassed`, `searchBoard`, `summarizeProducts`.
- **Shipment side** — imports `shipmentModel` and `applyShipmentTransform` from `./model`, indicating a parallel shipment repository (content truncated in the excerpt).

## Relationships

- **`./model`** — source of the Mongoose models, document types, and the transform functions (`applyFulfillmentOrderTransform`, `applyShipmentTransform`) passed to `createRepository`.
- **`@infrastructure/persistence/create-repository`** — supplies the `createRepository` factory, the `Repository`/`Wire` type contract, and the `toObjectId` helper used throughout.
- **`@infrastructure/persistence/conditional-status`** — exports `updateStatusIfIn`, imported as `conditionalStatus` for status-guarded writes.
- **`@infrastructure/security/reencrypt`** — provides `reencryptOf`, `ReencryptSpec`, `ReencryptReport` (likely consumed by the shipment or act paths).
- **`./domain` (barrel)** — re-exports `DUE_NOTICE_LEAD_MS`, `shipmentLifecycle`, `FulfillmentOrderDraft`, `WaitCause` used in query building and draft handling.
- **`@domain-primitives/time`** — provides `DAY_MS` for the `dueWithin` window arithmetic.
- **Services (`act`, `board`, `deliver`, `cut`, `cancel-remainder`, `digest`)** — upstream callers that read via `findInSession`/`findByOrderId` and write via `claim`; `board` consumes `BoardFilters`, `searchBoard`, and `summarizeProducts`.
- **`./presenter`** — consumes the document shapes returned by this repository for display.

## Notes

- **Explicit return types are required at the export boundary.** Mongoose's inferred generics are too large for TS to serialise (TS7056), so `Repository<…>` and the method signatures are hand-written. This is the same reason the `Repository` type alias exists.
- **`stateCondition` is kept in sync *by hand* with `boardStateOf` in `./domain`.** The integration suite enforces that the Mongo filter and the human-readable label agree on which documents count as "waiting."
- **`insertIfAbsent` uses `$setOnInsert` + `upsert` on `{ orderId, number }`**, making "create on payment" idempotent: a retried listener returns `false` and leaves the existing document untouched.
- **`claim` is an optimistic-lock write.** The `revision` field appears in the *filter*, not just the `$inc`; a concurrent act that incremented `revision` first will cause the loser's `findOneAndUpdate` to match zero documents and return `null`.
- **Preorder cause filter uses `$ne: 'backorder'`** rather than `$exists: false` because documents created before the `cause` field was introduced simply lack it—both should match "preorder."
