---
source: src/modules/delivery/repository.ts
sha256: cf74e21ab85e4d3b27e68992c5fb41e2f9b9dd497156952a46433f124f24aaa2
generated_at: 2026-11-08T05:32:44.493724+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/repository.ts

## Purpose
Persistence layer for the delivery module. Defines the two Mongoose collections (fulfillment orders, shipments), the shared CRUD factory, and the domain-specific conditional reads and revision-guarded writes that every delivery act is driven through. Return types are written out explicitly because Mongoose's generics are too large for TypeScript to infer at an export boundary (TS7056).

## Key elements
- **`BoardFilters`** (interface) — the filter shape for the preorder board: cause, state, productId, late, dueWithin, orderIds.
- **`ProductSummaryRow`** (interface) — one product's preorder unit counts as the aggregation returns them.
- **`stateCondition`** (private fn) — maps a `PreorderFulfillmentState` to a Mongo `QueryFilter`; kept in lockstep with `boardStateOf` in `./domain`.
- **`boardWhere`** (private fn) — ANDs every applicable clause from `BoardFilters` into a single filter, resolving `late` and `dueWithin` against a supplied `now`.
- **`FulfillmentOrderPatch`** (type) — the writable subset of a fulfillment order plus an `unset` array for field removal (released holds, cleared dates).
- **`fulfillmentOrderRepository`** (const, main export) — extends the `createRepository` base (CRUD) with:
  - `findByOrderId`, `findByOrderIds`, `findInSession` — reads scoped to an order, a set of orders, or a transaction.
  - `insertIfAbsent` — upsert guarded on `{ orderId, number }`; returns `true` only when this call created the document.
  - `claim` — optimistic-concurrency write: matches on `_id` + `revision`, applies `$set`/`$unset`, increments revision; returns `null` on conflict.
  - `scrubHoldNotesBefore`, `findWaitingForProduct`, `findDatePassed` — maintenance and digest queries (partially visible in truncated content).
  - `searchBoard`, `summarizeProducts` — paginated board and product-aggregation reads.

## Relationships
- **`./model`** (`src/modules/delivery/model.ts`) — source of `fulfillmentOrderModel`, `shipmentModel`, and the apply-transforms passed to `createRepository`.
- **`./domain`** (`src/modules/delivery/domain/index.ts` → `fulfillment.ts`) — provides `DUE_NOTICE_LEAD_MS`, `FulfillmentOrderDraft`, `WaitCause` used by the repository's query logic.
- **`src/infrastructure/persistence/create-repository.ts`** — supplies the `createRepository` factory, `toObjectId` helper, and the `Repository` / `Wire` generic types that shape the export.
- **`src/infrastructure/persistence/conditional-status.ts`** — `updateStatusIfIn` is imported as `conditionalStatus` for guarded status transitions.
- **`src/infrastructure/security/reencrypt.ts`** — `reencryptOf`, `ReencryptSpec`, `ReencryptReport` for encrypted-field handling on reads.
- **`src/domain-primitives/time.ts`** — `DAY_MS` used in `dueWithin` date arithmetic.
- **`src/modules/delivery/services/*.ts`** (act, board, cancel-remainder, cut, deliver, digest, ensure) and **`src/modules/delivery/presenter.ts`** — consume `fulfillmentOrderRepository`, `FulfillmentOrderPatch`, `BoardFilters`, and `ProductSummaryRow` as their persistence interface.

## Notes
- `stateCondition` and the `boardStateOf` function in `./domain` must agree on which documents are "waiting"; the preorder board's integration suite enforces this. Keeping them in sync is manual.
- `insertIfAbsent` uses `$setOnInsert` with `upsert: true`; a retried listener or a racing read will not overwrite an existing document. The boolean return lets a caller narrate "birth" exactly once.
- `claim` is the sole write path for act mutations: two acts racing the same fulfillment order cannot both land — the loser's revision filter matches nothing and the method resolves `null`.
- The `cause` filter for `'preorder'` uses `cause: { $ne: 'backorder' }` (not `$eq: 'preorder'`) because preorders created before backorder existed carry no `cause` field.
- The file is the single persistence seam for the delivery module; services and the presenter should not import Mongoose models directly.
