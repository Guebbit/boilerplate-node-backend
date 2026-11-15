---
source: src/modules/delivery/domain/lost.ts
sha256: 9ee3f9d329b46516ba4cb425e22880d2b63ac005aefd1ce6e1e6691930772e83
generated_at: 2026-11-14T19:40:02.151043+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/lost.ts

## Purpose
Pure domain logic for a delivery fulfillment order's lines when a shipment is reported lost and when that same parcel later turns up. Encodes the invariant that shipped + canceled never exceeds what was bought, and defines when restoration is allowed (all-or-nothing). No I/O or database access, so every case is unit-testable.

## Key elements
- **`LostShipmentFacts`** — minimal shape of a lost shipment (id, origin order id, lines) as the plan needs it.
- **`RestorableFulfillmentOrder`** — fulfillment order shape including an optional `sourceShipmentId` linking it back to the loss that spawned it.
- **`Restoration`** — result of a valid restoration: all shipped units to restore, the owed subset, and the owed fulfillment-order IDs to close.
- **`withLoss(lines, lost, owed)`** — returns the origin's lines after a loss: decrements `shippedQuantity` by the full lost amount and `quantity` by the owed amount; drops lines that hit zero.
- **`planRestoration(shipment, orders)`** — returns a `Restoration` or `undefined`. Allowed only when every owed unit is still unshipped/uncanceled on its linked order **and** the shelf-covered portion is still open on the origin. No partial restoration.
- **`withRestoration(lines, shipment, restoration)`** — returns the origin's lines after the parcel turns up: re-adds shipped quantities, re-attaches owed quantities, and resurrects any line the loss had dropped (titled from the shipment).
- **`OwedDate`** — promised date for owed units plus a `defaulted` flag.
- **`owedDateOf(restockDates, now, defaultDays)`** — if *every* owed product has a future restock date, uses the latest one; otherwise falls back to `now + defaultDays` and marks it `defaulted`.
- **`sumOf`** (private) — sums a per-line measure across orders for one product.

## Relationships
- **`src/domain-primitives/time.ts`** — provides `DAY_MS`, used by `owedDateOf` for the default-date calculation.
- **`src/modules/delivery/domain/fulfillment.ts`** — provides `plainLine`, `remainingOfLine`, and the `FulfillmentLine` / `ProductQuantity` types used throughout.
- **`src/modules/delivery/domain/index.ts`** — barrel module that re-exports this file's public surface.
- **`src/modules/delivery/services/lost.ts`** — service layer that calls `withLoss` (and likely `owedDateOf`) when recording a loss.
- **`src/modules/delivery/services/found.ts`** — service layer that calls `planRestoration` and `withRestoration` when a lost parcel is found.
- **`src/modules/delivery/services/owed.ts`** — service for the owed-unit side; consumes `OwedDate` / `owedDateOf`.
- **`src/modules/delivery/services/reship.ts`** — handles re-shipping the shelf-covered portion "through the ordinary door."
- **`src/modules/delivery/tests/unit/lost.test.ts`** — unit tests for every exported function.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`**, **`src/modules/delivery/tests/unit/reship.test.ts`** — exercise the interplay between loss/restoration and adjacent flows.

## Notes
- **All-or-nothing restoration**: `planRestoration` returns `undefined` the moment *any* single unit has been shipped or canceled. There is no partial-restore path.
- **`owedDateOf` is all-or-nothing per product set**: if even one product lacks a future restock date, *all* owed units get the default date (`defaulted: true`), not just the missing ones.
- **Dropped lines are revived on restoration**: `withRestoration` re-creates a line (with its title from the shipment) if `withLoss` had filtered it out.
- **`plainLine` is used to reset derived fields**: both `withLoss` and `withRestoration` spread `plainLine(line)` first, so any transient/derived fields on `FulfillmentLine` are cleared before the new quantities are applied.
- The module is intentionally side-effect-free; services (listed above) own persistence and orchestration.
