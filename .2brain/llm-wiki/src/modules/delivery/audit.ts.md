---
source: src/modules/delivery/audit.ts
sha256: 9c9fcb435b564b5375e49a92c5ac39db1cb3a3fe979f7c648b20c9ac21147cf6
generated_at: 2026-09-23T18:35:10.276958+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/audit.ts

## Purpose

Declares the delivery module's audit action identifiers and registers them into the shared `AuditActionMap` so that the observability layer can type-check which actions belong to this domain.

## Key elements

- **`deliveryAuditActions`** (exported const object) — The two audit action strings this module can emit:
  - `ADMIN_ORDER_SHIPPED` → `'admin.order.shipped'`
  - `ADMIN_ORDER_DELIVERED` → `'admin.order.delivered'`
- **Module augmentation** (`declare module '@infrastructure/observability/audit'`) — Adds a `delivery` key to the global `AuditActionMap` interface, scoped to the union of `deliveryAuditActions` values.

## Relationships

- **`src/modules/delivery/service.ts`** — The sole dependency-graph neighbor; expected to import `deliveryAuditActions` when recording handover or arrival events through the audit logger.

## Notes

- Actions are registered via **interface augmentation**, not a shared enum. The header comment points to `modules/account/audit.ts` as the reference for this convention — follow the same pattern when adding actions to other modules.
- The two actions are described in-file as "doors staff writes through": shipped (handover) and delivered (arrival). New delivery-side staff actions should follow the `ADMIN_ORDER_*` naming.
