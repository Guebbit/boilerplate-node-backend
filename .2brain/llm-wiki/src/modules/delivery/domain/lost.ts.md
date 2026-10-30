---
source: src/modules/delivery/domain/lost.ts
sha256: 3e04de03c6aecb9a62f801027a987886e828df27dd90e991de9233ae47920fab
generated_at: 2026-10-29T03:33:29.451719+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/lost.ts

## Purpose

Pure domain logic for the lost-in-transit lifecycle of a shipment: it computes how a fulfillment order's lines change when a shipment is reported lost, determines whether (and what) can be restored when the same parcel is later found, and derives the promised date for units that must be re-supplied. All functions are side-effect-free so every case is testable without a database.

## Key elements

- **`LostShipmentFacts`** / **`RestorableFulfillmentOrder`** — narrow input shapes the functions accept, decoupled from the full domain entities.
- **`Restoration`** — output of `planRestoration`: which units go back as *shipped*, which go back as *owed*, and which owed-fulfillment-orders to close.
- **`withLoss(lines, lost, owed)`** — returns the origin order's lines after a loss is recorded. Subtracts lost units from `shippedQuantity` and owed units from `quantity`; drops lines whose quantity reaches 0.
- **`planRestoration(shipment, orders)`** — all-or-nothing guard: returns a `Restoration` only if every unit the shipment carried is still open (unshipped, uncancelled) on both the origin and the linked owed orders. Returns `undefined` otherwise.
- **`withRestoration(lines, shipment, restoration)`** — the inverse of `withLoss`: puts shipped and owed units back onto the origin lines, re-creating any line that `withLoss` had dropped.
- **`owedDateOf(restockDates, now, defaultDays)`** — returns an `OwedDate` ({ at, defaulted }). Uses the latest future restock date if *every* product has one; otherwise falls back to `now + defaultDays`.
- **`plain`** (internal) — copies a `FulfillmentLine` (which may be a stored subdoc with getters) into a plain object so arithmetic is safe.
- **`sumOf`** (internal) — flat-maps lines across orders, filters by product, and reduces by a caller-supplied measure.

## Relationships

- **Imports** `DAY_MS` from `src/domain-primitives/time.ts` (used by `owedDateOf`).
- **Imports** `remainingOfLine`, `FulfillmentLine`, `ProductQuantity` from `./fulfillment` (`src/modules/delivery/domain/fulfillment.ts`).
- **Re-exported** through `src/modules/delivery/domain/index.ts` (barrel).
- **Consumed by** the service layer: `services/lost.ts` (records a loss), `services/found.ts` (records a found parcel, calls `planRestoration` / `withRestoration`), `services/owed.ts` (uses `owedDateOf`), `services/reship.ts` (re-ship flow).
- **Tested by** `tests/unit/lost.test.ts`; `tests/unit/fulfillment.test.ts` and `tests/unit/reship.test.ts` exercise adjacent logic.

## Notes

- **`plain` exists because of Mongoose getters.** Any `FulfillmentLine` that came from a stored document has properties behind getters; `plain` forces a flat copy so `Math.max`, spread, etc. behave as expected.
- **`planRestoration` is strictly all-or-nothing.** If *any* product's units are partially shipped or cancelled, the whole restoration is rejected (`undefined`), not partially applied.
- **`owedDateOf` defaults eagerly.** If even one product in the list has no future restock date, the result falls back to the shop default (`defaulted: true`). It is not "use restock dates when available, else default per-product."
- **Line dropping in `withLoss` vs. re-creation in `withRestoration`.** A line whose `quantity` hits 0 is removed by `withLoss`; `withRestoration` re-creates it using the shipment's `title`, since the stored line no longer exists to supply one.
- **`cancelledQuantity` is never modified** by either `withLoss` or `withRestoration` — it passes through `plain` unchanged.
