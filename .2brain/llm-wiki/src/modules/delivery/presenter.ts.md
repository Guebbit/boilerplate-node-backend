---
source: src/modules/delivery/presenter.ts
sha256: 1a13a3b2c32a0ffb76fd762292a9841286637fcc3a41124f642363697a69b6b5
generated_at: 2026-11-08T05:32:24.243158+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/presenter.ts

## Purpose
Single place where stored delivery documents (fulfillment orders, shipments) are shaped into the wire forms declared by `openapi.yaml` and the board/export views. Shapes are *built*, not serialized: computed fields like `remaining` don't exist on the stored document, and per-request decisions (caller `actions`, staff-only notes) are applied here.

## Key elements
- **`presentLines`** (internal) — maps stored order lines to wire lines, computing `remaining` via `remainingOfLine`.
- **`presentRecord`** (internal) — shared buyer-safe record for a fulfillment order; exposes `holdNotice`/`holdMessage` but never `holdReason`/`holdNote`.
- **`presentFulfillmentOrder`** — full wire shape: `presentRecord` + caller `actions` + staff-gated `holdReason`/`holdNote` + timestamps.
- **`presentExportFulfillmentOrder`** — account-export shape; unconditionally includes `holdReason` and `holdNote` (GDPR Art. 15).
- **`presentShipment`** — full wire shipment: record + `actions` + `awaitingTracking` + timestamps.
- **`presentExportShipment`** — export shipment; omits `actions`/`forced`; `lostNote` included only when `withNote` is true (buyer-facing pages pass `false`).
- **`presentPreorderFulfillmentOrder`** — board row: record + buyer brief (`email`, `orderNumber`, `paidAt`) + `boardStateOf`, `isLate`, `slippedDays`, `delivered` judgement.
- **`presentProductSummary`** — board Products tab row from a `ProductSummaryRow` aggregation.

## Relationships
- **`./domain` (fulfillment, hold-notice, preorder)** — supplies the pure judgement functions used here: `remainingOfLine`, `boardStateOf`, `holdNoticeOf`, `isLate`, `slippedDays`.
- **`./model`** — provides the stored-document types (`FulfillmentOrderDocument`, `ShipmentDocument`) that are the inputs to every presenter.
- **`./pii`** — `decryptDestination` is called to decrypt the stored destination before it appears in any shipment shape.
- **`./repository`** — `ProductSummaryRow` type (the aggregation output) is the input to `presentProductSummary`.
- **`@modules/orders`** — `OrderBrief` carries buyer `email`, `orderNumber`, `userId`, `paidAt` for the board presenter.
- **`@modules/shop`** — `shopDayOf` converts timestamps to shop-local date strings; `shopTimezone()` is passed to `slippedDays`.
- **`services/read.ts`, `services/board.ts`, `services/actions.ts`** — call sites that choose which presenter to invoke and supply the per-request `actions` / `staffView` / `awaitingTracking` parameters.
- **Tests** — `fulfillment.test.ts`, `destination.test.ts`, `preorder-late.test.ts` exercise the presenters directly.

## Notes
- **GDPR split:** the wire shape hides staff `holdReason`/`holdNote` unless `staffView` is true; the *export* shape always includes them (staff assessment is the buyer's data under Art. 15). The same logic applies to `lostNote` on shipments (gated by `withNote`).
- **Date handling is deliberate:** `agreedAt`/`expectedAt` go through `shopDayOf` (date-only, shop timezone), while `lastNoticeAt`/`paidAt`/timestamps stay as full ISO strings.
- **`createdAt` fallback:** both fulfillment-order presenters default a missing `createdAt` to `new Date(0)` rather than omitting the field, because the wire schema requires it.
- **`presentRecord` is the DRY anchor:** every fulfillment-order shape spreads it first, so adding a field to the record automatically propagates to wire, export, and board shapes.
