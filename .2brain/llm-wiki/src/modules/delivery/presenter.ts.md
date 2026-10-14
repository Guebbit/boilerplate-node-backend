---
source: src/modules/delivery/presenter.ts
sha256: 8f266d5f71a0feb3e512824eaeb945847df2cbbe7fc5a8c0fdd9bf79a55d9fab
generated_at: 2026-10-14T15:24:48.799057+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/presenter.ts

## Purpose

Pure transformation layer that turns stored delivery documents into the wire shapes declared in `openapi.yaml` (and account-export variants). It exists so that per-request decisions—caller `actions`, staff-only hold note visibility, computed `remaining` quantities—are applied at the edge rather than baked into the stored record.

## Key elements

- **`presentShipment(shipment, actions)`** — Full API shipment: export fields + `forced` + caller `actions` + timestamps.
- **`presentExportShipment(shipment)`** — Shipment without `actions`/`forced`; lines reduced to `{productId, title, quantity}`.
- **`presentFulfillmentOrder(order, actions, showNote)`** — Full API fulfillment order: record + `actions` + conditional `holdNote` + timestamps.
- **`presentExportFulfillmentOrder(order)`** — Export variant: record + `holdNote` (staff assessment treated as buyer data) but no `actions`.
- **`presentPreorderFulfillmentOrder(order, brief, delivered, now)`** — Board-row shape: merges order record with buyer/payment from `OrderBrief`, adds `state`, `slippedDays`, `late`, `delivered` judgements.
- **`presentProductSummary(row)`** — Board Products-tab row from a repository aggregation.
- **`presentLines(lines)`** *(internal)* — Maps stored lines to wire lines, computing `remaining` via `remainingOfLine`.
- **`presentRecord(order)`** *(internal)* — Shared field projection for all fulfillment-order variants; omits `holdNote` and `actions`.

## Relationships

- **`./domain`** (fulfillment.ts, preorder.ts, index.ts) — Supplies the judgement functions `boardStateOf`, `isLate`, `remainingOfLine`, `slippedDays` used in board and line presentations.
- **`./model.ts`** — Source of the stored document types (`FulfillmentOrderDocument`, `ShipmentDocument`) that these functions consume.
- **`./repository.ts`** — Provides the `ProductSummaryRow` aggregation shape consumed by `presentProductSummary`.
- **`@modules/orders`** (index.ts, services/read.ts) — Supplies `OrderBrief` (buyer email, `userId`, `paidAt`) for the preorder board row.
- **`@types`** — Declares all output wire shapes (`FulfillmentOrder`, `Shipment`, `PreorderFulfillmentOrder`, `ExportShipment`, `ExportFulfillmentOrder`, action enums).
- **`./services/board.ts`, `./services/read.ts`, `./services/actions.ts`** — Consumers that call the presenters to build API responses.

## Notes

- `createdAt` falls back to `new Date(0)` (epoch) when the stored document lacks it—downstream code should not assume a meaningful creation time.
- `holdNote` is **never** in `presentRecord`; it is added explicitly by `presentFulfillmentOrder` (gated by `showNote`) and unconditionally by `presentExportFulfillmentOrder`. The two paths intentionally differ.
- `presentExportShipment` narrows lines to three fields; the full `presentShipment` reuses `presentExportShipment` and then adds `forced`/`actions`/timestamps—do not duplicate the base field list.
- All date fields are emitted as ISO strings via `.toISOString()`; conditional spread (`...(x ? {…} : {})`) is the convention for optional timestamps rather than emitting `null`/`undefined`.
