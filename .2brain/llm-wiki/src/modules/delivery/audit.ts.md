---
source: src/modules/delivery/audit.ts
sha256: ab5df7ccadd54bf75c3be4de3879a48ae508560dad9d6bae3c7f6c8cfbfaeac6
generated_at: 2026-11-08T05:25:51.857121+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/audit.ts

## Purpose

Declares the set of audit action identifiers that delivery-related admin operations emit, and registers them into the shared `AuditActionMap` type via module augmentation. Exists so that every delivery service has a single, type-safe source of truth for the action strings it records.

## Key elements

- **`deliveryAuditActions`** (exported const, `as const`) — Maps eight semantic keys (`ADMIN_ORDER_FULFILLMENT_STARTED`, `ADMIN_ORDER_SHIPPED`, `ADMIN_ORDER_DELIVERED`, `ADMIN_ORDER_FULFILLED`, `ADMIN_SHIPMENT_TRACKING_EDITED`, `ADMIN_SHIPMENT_LOST`, `ADMIN_FULFILLMENT_ORDER_HELD`, `ADMIN_FULFILLMENT_ORDER_RELEASED`) to dot-notation action strings following the `admin.{entity}.{verb}` pattern.
- **Module augmentation of `AuditActionMap`** — Adds a `delivery` property (union of all action values) to the interface in `@infrastructure/observability/audit`, making the actions part of the global type system without a shared enum.

## Relationships

- **Consumed by all sibling services** (`deliver.ts`, `fulfill.ts`, `holds.ts`, `lost.ts`, `process.ts`, `ship.ts`, `tracking.ts`) — each service references the relevant action identifier when writing its audit record. This file is the sole owner of those string literals.

## Notes

- Actions are declared here by **augmentation**, not a shared enum. See `modules/account/audit.ts` for the design rationale.
- **Metadata conventions** (documented in the block comment; enforced by callers, not by this file's types):
  - `delivered` — include `forced` flag and operator `reason` when it was a sanctioned bypass; include `wasLost` if the shipment had been previously reported lost.
  - `tracking_edited` — include `changes.trackingCode: {from, to}` only when the code actually changed.
  - `held` / `released` — record the hold's **reason code**, never the free-text `holdNote`.
  - `lost` — record the **reason code**, never `lostNote` or `lostMessage`.
- The file has **no runtime imports**; it is a pure type/constant declaration.
