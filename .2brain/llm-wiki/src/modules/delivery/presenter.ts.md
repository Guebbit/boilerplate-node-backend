---
source: src/modules/delivery/presenter.ts
source_sha256: 1a13a3b2c32a0ffb76fd762292a9841286637fcc3a41124f642363697a69b6b5
context_sha256: 4be2e5e5f3d5cce65f29f06eb257067d89ed41caa52036eeea019183b079e024
generated_at: 2026-11-22T04:51:40.131611+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/presenter.ts

## Purpose
The single place where stored delivery documents (fulfillment orders and shipments) are converted into the wire shapes declared in `openapi.yaml`. Output is built rather than serialized: stored lines carry no `remaining`, and `actions` and staff-only fields are decided per request.

## Key elements
- `presentShipment(shipment, actions, awaitingTracking, staffView)` – full shipment for the API: export shape plus `forced`, `awaitingTracking`, `actions`, and `createdAt`/`updatedAt` when present.
- `presentExportShipment(shipment, withNote = true)` – shipment as an account export: no `actions`/`forced`. Decrypts `destination` (keyed by the shipment id) and includes `lostNote` only when `withNote` is true.
- `presentFulfillmentOrder(fo, actions, staffView)` – full fulfillment order for the API: shared record, `actions`, `createdAt` (falls back to epoch if missing), `updatedAt`, and `holdReason`/`holdNote` only when `staffView`.
- `presentExportFulfillmentOrder(fo)` – account-export shape: shared record plus `holdReason` and `holdNote` always included.
- `presentPreorderFulfillmentOrder(fo, brief, delivered, now)` – board row for a preorder: record, buyer/payment from an `OrderBrief` (empty strings if `brief` is missing), `state`, `slippedDays`, `late`, `delivered`, and `holdReason`.
- `presentProductSummary(row)` – maps a `ProductSummaryRow` to `PreorderProductSummary` for the board's Products tab.
- Private helpers: `presentLines` (adds computed `remaining` to each line) and `presentRecord` (the buyer-safe fulfillment order base).

## Relationships
- **`./domain`** supplies the logic used here: `remainingOfLine`, `holdNoticeOf`, `boardStateOf`, `isLate`, `slippedDays`.
- **`./model`** provides the `FulfillmentOrderDocument` and `ShipmentDocument` input types.
- **`./repository`** provides the `ProductSummaryRow` type for `presentProductSummary`.
- **`./pii`** provides `decryptDestination` for shipment destinations.
- **`@modules/orders`** provides the `OrderBrief` type used for board rows.
- **`@modules/shop`** provides `shopDayOf` and `shopTimezone` for day formatting and slippage calculation.
- **`@types`** defines the output shapes and action types.
- `src/modules/delivery/services/read.ts`, `src/modules/delivery/services/board.ts`, `src/modules/delivery/services/actions.ts` and `src/modules/delivery/module.ts` are the likely callers, but their imports are not visible in this file.

## Notes
- Hold disclosure differs by reader: the standard record exposes only a buyer-safe `holdNotice` (derived from the reason) and `holdMessage`. The raw `holdReason`/`holdNote` appear only with `staffView` or in the account export (GDPR Art. 15).
- `presentExportShipment` defaults `withNote` to true; callers showing a buyer the order page must pass false. `presentShipment` passes through its `staffView` flag as `withNote`.
- Board rows (`presentPreorderFulfillmentOrder`) include `holdReason` unconditionally and carry no `actions`, so they are presumably for staff only.
- `agreedAt` and `expectedAt` are emitted as shop-local days via `shopDayOf`; other timestamps are ISO strings.
- Optional fields are omitted entirely rather than set to null or undefined.
