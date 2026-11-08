---
source: src/modules/delivery/domain/lost.ts
sha256: 489064576743b676f7355766cc14930ed242a5a4601b9ac089e68ae3e346214f
generated_at: 2026-11-08T05:28:54.327800+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/lost.ts

## Purpose

Pure domain logic for the lost-in-transit lifecycle: it computes how a fulfillment order's lines change when a shipment is reported lost, decides whether the shipment may later be recorded as found (and what that restores), and derives the promised delivery date for the owed units. All functions are side-effect free so every branch is testable without a database.

## Key elements

- **`LostShipmentFacts`** – minimal shape of a lost shipment (id, origin fulfillment order id, product lines).
- **`RestorableFulfillmentOrder`** – shape of a fulfillment order as the restoration plan needs it (id, optional `sourceShipmentId`, lines).
- **`Restoration`** – the result of a valid restoration: units going back to `shippedQuantity`, units going back to `quantity`, and the owed fulfillment order ids to close.
- **`withLoss(lines, lost, owed)`** – returns the origin's lines after a loss: subtracts lost units from `shippedQuantity`, subtracts owed units from `quantity`; drops any line whose quantity reaches 0.
- **`planRestoration(shipment, orders)`** – validates that *every* unit the shipment carried is still open (owed units unshipped/uncanceled on linked orders; shelf-covered units still open on the origin). Returns a `Restoration` or `undefined` (all-or-nothing).
- **`withRestoration(lines, shipment, restoration)`** – returns the origin's lines after the parcel turns up: adds `shippedQuantity` back, adds owed units back to `quantity`, and re-creates any line the loss had dropped.
- **`OwedDate` / `owedDateOf(restockDates, now, defaultDays)`** – computes the promised date for owed units: the latest future restock date if *all* products have one, otherwise the shop's default (`now + defaultDays`). The `defaulted` flag records which path was taken.
- **`plain`** *(internal)* – copies a stored subdocument line into a plain object, bypassing getters.
- **`sumOf`** *(internal)* – sums a per-line measure across multiple fulfillment orders for one product.

## Relationships

- **`src/domain-primitives/time.ts`** – imports `DAY_MS` for the default-date arithmetic in `owedDateOf`.
- **`src/modules/delivery/domain/fulfillment.ts`** – imports `remainingOfLine` (open-unit helper) and the `FulfillmentLine` / `ProductQuantity` types; `planRestoration` relies on `remainingOfLine` to check that owed/shelf units are still unshipped and uncanceled.
- **`src/modules/delivery/domain/index.ts`** – barrel re-export surface for this module.
- **`src/modules/delivery/services/lost.ts`**, **`services/found.ts`**, **`services/owed.ts`**, **`services/reship.ts`** – application services that call the pure functions here to perform the actual state transitions.
- **`src/modules/delivery/tests/unit/lost.test.ts`** – unit tests for `withLoss`, `planRestoration`, `withRestoration`, `owedDateOf`.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`**, **`tests/unit/reship.test.ts`** – exercise this module's logic indirectly through fulfillment and reship scenarios.

## Notes

- `withLoss` mutates nothing; it returns a new array. Callers replace the stored lines with the result.
- `planRestoration` is strictly all-or-nothing: if *any* product has a shipped or canceled unit in the linked or origin orders, it returns `undefined` and no partial restoration occurs.
- `owedDateOf` falls back to the default date when **any** product in the list lacks a future restock date—even if the others do. The `defaulted` flag lets downstream code distinguish a catalogue-backed date from a fallback so that later restock-date edits don't silently move a promise.
- The `plain` helper exists because stored lines are Mongoose subdocuments with getter-backed fields; passing them through a plain-object spread normalises them for the pure arithmetic.
