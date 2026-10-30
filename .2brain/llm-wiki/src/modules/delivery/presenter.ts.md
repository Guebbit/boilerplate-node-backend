---
source: src/modules/delivery/presenter.ts
sha256: 7ebd30d49c1b8fbf0c8b616b39f5994c9ca1d8050a06c5ef4d9768d15d0767fd
generated_at: 2026-10-29T03:36:23.899229+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/presenter.ts

## Purpose

Single-point presentation layer that transforms stored delivery domain documents (`FulfillmentOrderDocument`, `ShipmentDocument`) into the wire shapes declared by `openapi.yaml`. Rather than serializing the stored form, it computes derived fields (`remaining`, `boardStateOf`, `isLate`, `slippedDays`), decrypts PII, and applies per-caller visibility rules (buyer vs. staff, API vs. account-export) so that no client performs business-logic counting or access decisions.

## Key elements

- **`presentLines`** (private) — Maps stored line items to wire lines, adding the computed `remaining` via `remainingOfLine`.
- **`presentShipment`** — Full API shipment shape: spreads `presentExportShipment`, then adds `forced`, `awaitingTracking`, caller `actions`, and optional timestamps.
- **`presentExportShipment`** — Account-export shipment: no `actions`/`forced`; includes `lostNote` (staff's loss assessment, GDPR Art. 15) unless suppressed by `withNote`.
- **`presentRecord`** (private) — Shared base shape for a fulfillment order visible to any reader; exposes `holdNotice` (buyer-safe) and `holdMessage` but never `holdReason`/`holdNote`.
- **`presentExportFulfillmentOrder`** — Export variant; adds `holdReason` and `holdNote` (staff's assessment is the buyer's data).
- **`presentFulfillmentOrder`** — API variant; adds caller `actions` and conditionally includes `holdReason`/`holdNote` when `staffView` is true.
- **`presentPreorderFulfillmentOrder`** — Board shape for a preorder's fulfillment order: joins in the buyer's `OrderBrief`, computes `boardStateOf`, `slippedDays`, `isLate`, and carries a `delivered` flag.
- **`presentProductSummary`** — Maps a `ProductSummaryRow` (repository aggregation) to the board Products-tab wire shape.

## Relationships

- **`./domain/` (index, fulfillment, hold-notice, preorder)** — Imports the pure judgement helpers `boardStateOf`, `holdNoticeOf`, `isLate`, `remainingOfLine`, `slippedDays` that the presenter delegates to rather than re-implementing.
- **`./pii.ts`** — Calls `decryptDestination` to resolve the shipment's encrypted destination before sending it on the wire.
- **`./model.ts`** — Consumes the `FulfillmentOrderDocument` and `ShipmentDocument` types (the stored/DB shape) as its input.
- **`./repository.ts`** — Imports the `ProductSummaryRow` type produced by the board's aggregation query.
- **`@modules/orders` (orders/index.ts)** — Imports `OrderBrief` so the board presenter can embed the buyer's email, user ID, and payment timestamp without re-querying the orders module.
- **`services/read.ts`, `services/board.ts`, `services/actions.ts`** — Upstream callers that invoke these presenters to build their API / board / export responses (they are not imported *here*; the dependency flows the other direction).
- **Tests** — `fulfillment.test.ts` (unit) and `destination.test.ts`, `preorder-late.test.ts` (integration) exercise the presenter's output shapes and conditional inclusions.

## Notes

- **Three distinct visibility tiers** are enforced per document: *record* (all readers, buyer-safe), *API* (adds caller `actions` + optional staff fields), and *export* (adds staff assessment fields, drops `actions`/`forced`). Confusing these tiers leaks staff-only data to buyers.
- `createdAt` on fulfillment orders is backfilled with `new Date(0)` when absent, so the field is always present on the wire; shipments use conditional spread instead (field may be absent).
- `lostNote` / `holdNote` inclusion is governed by GDPR Art. 15 framing in the JSDoc: staff's assessment of a buyer is treated as the buyer's own data, so exports always carry it; API responses gate it behind `staffView`.
- `decryptDestination` receives the shipment `_id` as a context key — the key is per-document, not global.
