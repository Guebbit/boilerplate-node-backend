---
source: src/modules/delivery/domain/fulfillment.ts
sha256: a93d20ab1daf9114b8030f2f5051625e3b609a85b1b738748171d8213d367c78
generated_at: 2026-10-14T15:22:33.171056+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/fulfillment.ts

## Purpose

Pure domain rules for fulfillment: how an order's lines split into fulfillment orders at payment time, what quantity remains on each line, which status follows from the lines and any hold, and the summary the parent `orders` document carries. Every function is side-effect-free so the whole rule set is testable without a database.

## Key elements

- **`FulfillmentLine`** — one product on a fulfillment order with `quantity`, `shippedQuantity`, `cancelledQuantity`.
- **`GroupableLine`** — the shape the grouping rule reads off an order's frozen snapshot; adds `ships`, `preorder`, `releaseDate`.
- **`FulfillmentOrderDraft`** — a fulfillment order as produced by `groupOrderLines`, before numbering and storage.
- **`groupOrderLines(lines)`** — the core split rule. Non-preorder lines form one `open` order; preorder lines get one `on_hold` (`awaiting_stock`) order per distinct UTC release day. Returns numbered drafts (1-based). A preorder line with no `releaseDate` is treated as an ordinary line.
- **`statusOfLines(lines, held)`** — derives `FulfillmentOrderStatus` from remaining quantity, hold, and shipped count. Never set imperatively.
- **`checkShipLines(lines, requested)`** — validates a shipment request against remaining quantities; returns a `ShipLinesVerdict` discriminated union. `undefined`/empty request means "ship everything that remains."
- **`withShipped(lines, shipped)`** — returns new lines with `shippedQuantity` incremented.
- **`withRemainderCancelled(lines)`** — returns new lines with all remaining units moved to `cancelledQuantity`.
- **`remainderLines(lines)`** — flat `ProductQuantity[]` of lines that still have units left.
- **`summarize(inputs)`** — recomputes the `FulfillmentReport` (shipped, remaining, onHold, awaitingStock, undelivered, lastDeliveredAt) from fulfillment orders and shipments. Never adjusted incrementally.
- **`remainingOfLine` / `remainingOf`** — arithmetic helpers for "quantity − shipped − cancelled."

## Relationships

- **`domain/index.ts`** — re-exports this module's public API for consumers within the delivery domain.
- **`domain/preorder.ts`** — provides the preorder-specific domain types/concepts (`preorder`, `releaseDate`) that `GroupableLine` and `groupOrderLines` consume.
- **`model.ts`** — defines the Mongoose subdocument schema for stored fulfillment lines; this module's `plainLine` helper exists specifically to work around Mongoose getter semantics when reading those subdocuments.
- **`services/fulfill.ts`** — orchestrates payment-time fulfillment; calls `groupOrderLines` to create the initial fulfillment orders.
- **`services/cut.ts`** — processes a shipment; calls `checkShipLines` to validate, then `withShipped` to record it.
- **`services/cancel-remainder.ts`** — calls `remainderLines` to identify what to cancel and `withRemainderCancelled` to apply it.
- **`services/holds.ts`** — reads/writes hold state; relies on `statusOfLines` to keep derived status consistent with the hold flag.
- **`services/confirm-wait.ts`** — lifts a preorder hold; interacts with the `on_hold` / `awaiting_stock` state produced by `groupOrderLines`.
- **`services/progress.ts`** — calls `summarize` after any fulfillment-order mutation to refresh the order-level report.
- **`services/override-sync.ts`** — syncs corrected data back; depends on the same line-level arithmetic (`remainingOfLine`, `withShipped`, `withRemainderCancelled`).
- **`services/read.ts`** — assembles read-model output; uses `remainderLines` and `summarize` for display.
- **`presenter.ts`** — maps domain data to UI shapes; reads `FulfillmentReport` and `FulfillmentLine` fields.
- **`repository.ts`** — persists the drafts produced by `groupOrderLines` and stores updated lines from `withShipped` / `withRemainderCancelled`.
- **`services/actions.ts`** — top-level action dispatch; routes to the above services and relies on this module's pure helpers for in-memory computation before persisting.

## Notes

- **Mongoose subdocument trap:** `plainLine` copies fields individually because a spread on a Mongoose subdocument does not invoke its getters. Always pass lines through `plainLine` (or the exported functions that use it internally) before writing back.
- **Preorder grouping is UTC-day-granular.** `dayKey` slices an ISO string to `YYYY-MM-DD`. Two preorders 12 hours apart on the same UTC day land in the same fulfillment order.
- **`agreedAt` and `expectedAt` are set to the same instant** (the latest `releaseDate` in the group) by `groupOrderLines`. They are not distinct concepts at creation time.
- **Digital lines in a mixed order** ride with the physical fulfillment order (`kindOf` returns `physical` if *any* line ships). They do not get a separate digital order.
- **`summarize` is a full recompute**, not an incremental update. If a service mutates lines it should call `summarize` afterward rather than adjusting the report fields by hand.
- **Status is always derived** via `statusOfLines`; no service should write `status` directly.
