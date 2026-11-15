---
source: src/modules/delivery/audit.ts
sha256: 1bed0221b543359e3708d23ca7ca0f9625b50e90850d9cd2670d5c1e4696962c
generated_at: 2026-11-14T19:37:42.231952+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/audit.ts

## Purpose

Declares the set of audit-action identifiers that the delivery module emits and registers them into the shared `AuditActionMap` so that the observability layer can type-check every delivery audit entry at compile time.

## Key elements

- **`deliveryAuditActions`** (`as const` object) — Maps human-readable keys to the string identifiers actually written to the audit log:
  - `ADMIN_ORDER_FULFILLMENT_STARTED` → `admin.order.fulfillment_started`
  - `ADMIN_ORDER_SHIPPED` → `admin.order.shipped`
  - `ADMIN_ORDER_DELIVERED` → `admin.order.delivered`
  - `ADMIN_ORDER_FULFILLED` → `admin.order.fulfilled`
  - `ADMIN_SHIPMENT_TRACKING_EDITED` → `admin.shipment.tracking_edited`
  - `ADMIN_SHIPMENT_LOST` → `admin.shipment.lost`
  - `ADMIN_FULFILLMENT_ORDER_HELD` → `admin.fulfillment_order.held`
  - `ADMIN_FULFILLMENT_ORDER_RELEASED` → `admin.fulfillment_order.released`
- **`declare module '@infrastructure/observability/audit'`** — Augments the shared `AuditActionMap` interface with a `delivery` key whose value is the union of the action strings above, enabling compile-time safety downstream.

## Relationships

Each delivery service imports `deliveryAuditActions` (or references the augmented union) to tag the audit entries it writes:

- **`src/modules/delivery/services/fulfill.ts`** — emits `ADMIN_ORDER_FULFILLMENT_STARTED` and `ADMIN_ORDER_FULFILLED`.
- **`src/modules/delivery/services/ship.ts`** — emits `ADMIN_ORDER_SHIPPED`.
- **`src/modules/delivery/services/deliver.ts`** — emits `ADMIN_ORDER_DELIVERED`.
- **`src/modules/delivery/services/tracking.ts`** — emits `ADMIN_SHIPMENT_TRACKING_EDITED`.
- **`src/modules/delivery/services/lost.ts`** — emits `ADMIN_SHIPMENT_LOST`.
- **`src/modules/delivery/services/holds.ts`** — emits `ADMIN_FULFILLMENT_ORDER_HELD` / `ADMIN_FULFILLMENT_ORDER_RELEASED`.
- **`src/modules/delivery/services/process.ts`** — participates in the fulfillment lifecycle actions exposed here.

## Notes

- Actions are declared by **module augmentation**, not a shared enum — the file's own doc comment points to `modules/account/audit.ts` for the rationale. Follow the same pattern when adding new actions.
- **Metadata conventions** (documented in the header comment, enforced by the emitting services):
  - `tracking_edited` carries `changes.trackingCode {from, to}` only when the value actually changed.
  - `held` / `released` record the hold **reason code**, never the free-text `holdNote`.
  - `lost` records the reason code, never `lostNote` or `lostMessage`.
  - `delivered` includes `wasLost` when a previously lost shipment was recovered.
- The file exports **no functions** — it is purely a type-level registry plus a value-level constant.
