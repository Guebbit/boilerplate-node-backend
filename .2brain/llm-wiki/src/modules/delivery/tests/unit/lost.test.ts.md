---
source: src/modules/delivery/tests/unit/lost.test.ts
source_sha256: beefa840c23f961237c766e1ff3a653b48fcef5ae5da11b8338853fc9957a1ee
context_sha256: 279f78c31a5b6bdaab7080996b65adae5c2eee249c74b56bc701da2991727ddf
generated_at: 2026-11-22T05:04:38.801611+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/unit/lost.test.ts

## Purpose
Unit tests for the pure "lost parcel" arithmetic of the delivery domain. They cover what a loss does to the origin fulfillment order's lines, when a found parcel may be restored, what restoration puts back, and the date the owed units are promised for. No services or I/O are involved; everything is exercised through functions imported from `../../domain`.

## Key elements
- **Helpers**
  - `line(productId, quantity, fields?)` builds a `FulfillmentLine` with nothing shipped or canceled unless overridden.
  - `shipment(...units)` builds a `LostShipmentFacts` (id `s1`, from fulfillment order `fo1`).
  - `origin(lines)` builds the origin order (`fo1`).
  - `owedOrder(lines)` builds an order owed by the loss (`fo2`, `sourceShipmentId: 's1'`).
- **`withLoss`**
  - Every lost unit comes off `shippedQuantity`, and the owed units also come off `quantity`.
  - Untouched lines are left alone.
  - A line whose units are all owed elsewhere is dropped. The order then reads `closed`, not `canceled`, via `statusOfLines`.
  - `shippedQuantity` never goes below zero.
- **`planRestoration`**
  - Returns a plan of `shipped`, `owed` and `owedFulfillmentOrderIds`.
  - It succeeds when the shelf part is open on the origin and any owed units are still unshipped and uncanceled. Owed units are counted across several orders split off by a short delivery.
  - It returns `undefined` in these cases:
    - the replacement shipped, wholly or partly;
    - the remainder was canceled;
    - any owed unit was shipped or canceled;
    - the origin order is missing.
  - Orders whose `sourceShipmentId` belongs to a different loss are ignored.
- **`withRestoration`**
  - Re-ships the units and takes the owed ones back onto the origin.
  - A line the loss dropped is brought back, titled from the shipment.
  - It undoes `withLoss` exactly (round-trip test).
- **`summarize` with a lost shipment**
  - A lost shipment counts as `shipped: true` but `undelivered: 0`, with `remaining` still counted.
- **`owedDateOf(dates, now, defaultDays)`**
  - Takes the latest future restock date.
  - It falls back to `now + default days` with `defaulted: true` if any product has no date, or if a date is already past.

## Relationships
- Imports `owedDateOf`, `planRestoration`, `statusOfLines`, `summarize`, `withLoss`, `withRestoration` and the types `FulfillmentLine`, `LostShipmentFacts`, `RestorableFulfillmentOrder` from the domain barrel, `src/modules/delivery/domain/index.ts`. The logic under test lives in `src/modules/delivery/domain/lost.ts` and `src/modules/delivery/domain/fulfillment.ts`.
- The sibling `src/modules/delivery/tests/unit/fulfillment.test.ts` covers the related fulfillment domain.
- The service files listed as neighbors (`src/modules/delivery/services/lost.ts`, `cut.ts`, `deliver.ts`, `fulfill.ts`, `notify.ts`, `read.ts`, `digest.ts`) are not imported here, and neither are `src/app/error-handling.ts` or `tests/unit/scenarios/webhook-sink.test.ts`.

## Notes
- The tests use fixed dates (`now = 2026-10-26T10:00:00Z`) and a `DAY` constant, so they don't depend on the real clock.
- Tests use the global `describe`/`it`/`expect` with no explicit import.
