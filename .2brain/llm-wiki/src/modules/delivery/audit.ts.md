---
source: src/modules/delivery/audit.ts
sha256: 4e639ae19a5d3f8cff6cf6f7bde3608715174c959fda7fa656fb1f4b93047e76
generated_at: 2026-10-15T10:26:20.143812+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/audit.ts

## Purpose
Declares the audit action identifiers for the delivery domain and registers them into the shared `AuditActionMap` type, so that delivery service code can emit type-safe audit events without a runtime enum.

## Key elements
- **`deliveryAuditActions`** (exported const object) — Maps readable names (`ADMIN_ORDER_FULFILLED`, `BUYER_WAIT_CONFIRMED`, etc.) to dot-separated action strings. Covers staff actions (fulfilment started, shipped, delivered, fulfilled, tracking edited, order held/released) and the single buyer action (wait confirmed).
- **`declare module '@infrastructure/observability/audit'`** — Module augmentation that adds a `delivery` key to `AuditActionMap`, typed as the union of all action values. This is the mechanism by which the delivery domain plugs its actions into the global audit schema (same pattern as `modules/account/audit.ts`).

## Relationships
- **All delivery service files** (`start.ts`, `ship.ts`, `deliver.ts`, `fulfill.ts`, `tracking.ts`, `holds.ts`, `confirm-wait.ts`) — Each service imports `deliveryAuditActions` and references the relevant constant when recording an audit event (e.g. `start.ts` emits `ADMIN_ORDER_FULFILMENT_STARTED`, `confirm-wait.ts` emits `BUYER_WAIT_CONFIRMED`). This file is the single source of truth for those string values.
- **`@infrastructure/observability/audit`** — The augmented module; `AuditActionMap` is the shared interface that all domain modules extend.

## Notes
- Actions are declared via `as const` + module augmentation rather than a shared enum, following the convention established in `modules/account/audit.ts`. Adding a new delivery audit action means adding a key here and updating the consuming service file.
- The action string prefixes (`admin.*` vs. `fulfillment_order.*`) encode *who* performs the action, not *what* entity is affected—don't rely on the second segment to infer the resource.
