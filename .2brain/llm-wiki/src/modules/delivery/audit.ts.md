---
source: src/modules/delivery/audit.ts
source_sha256: 1bed0221b543359e3708d23ca7ca0f9625b50e90850d9cd2670d5c1e4696962c
context_sha256: 9a07a60ac15be272668cb5ba38f52d3158dfde75b5dfb16afe4232e28a443093
generated_at: 2026-11-22T04:44:47.927121+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/audit.ts

## Purpose
Declares the audit action strings emitted by the delivery module and registers their type into the shared audit action map. Actions are declared via module augmentation rather than a shared enum (rationale is documented in `src/modules/account/audit.ts`).

## Key elements
- `deliveryAuditActions` — a `const` object mapping keys to audit action strings, covering the staff-facing write operations:
  - `ADMIN_ORDER_FULFILLMENT_STARTED` → `admin.order.fulfillment_started`
  - `ADMIN_ORDER_SHIPPED` → `admin.order.shipped`
  - `ADMIN_ORDER_DELIVERED` → `admin.order.delivered`
  - `ADMIN_ORDER_FULFILLED` → `admin.order.fulfilled` (digital fulfillment orders)
  - `ADMIN_SHIPMENT_TRACKING_EDITED` → `admin.shipment.tracking_edited`
  - `ADMIN_SHIPMENT_LOST` → `admin.shipment.lost`
  - `ADMIN_FULFILLMENT_ORDER_HELD` → `admin.fulfillment_order.held`
  - `ADMIN_FULFILLMENT_ORDER_RELEASED` → `admin.fulfillment_order.released`
- `declare module '@infrastructure/observability/audit'` — augments `AuditActionMap` with a `delivery` key whose type is the union of the values above.

## Relationships
The neighbors are the delivery services (`deliver`, `fulfill`, `holds`, `lost`, `process`, `ship`, `tracking`). They line up with the actions here: delivery, fulfillment, holds, lost reporting, shipping, and tracking edits. This file only declares the action names; it contains no logic and imports nothing. `process.ts` most plausibly corresponds to the fulfillment-started action, but that is not stated in the file. The augmentation targets `@infrastructure/observability/audit`.

## Notes
Documented metadata conventions for these events:
- `tracking_edited`: `changes.trackingCode` as `{from, to}`, only when the code actually changed.
- `held` / `released`: the hold's reason code, never `holdNote` (free text).
- `lost`: the reason code, never `lostNote` or `lostMessage`.
- `delivered`: `wasLost` when a shipment previously reported lost turned up.
