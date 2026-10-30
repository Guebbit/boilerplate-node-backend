---
source: src/modules/delivery/audit.ts
sha256: 1c913f95ddbb03a5d6c86d0645a496ce42a315e23f85223f1ebb8e5cc38b5a4e
generated_at: 2026-10-29T03:31:05.280478+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/audit.ts

## Purpose

Declares the set of audit-action identifiers that the delivery module emits and registers them into the shared `AuditActionMap` via TypeScript module augmentation. It exists so that every delivery service file can reference a typed, exhaustive set of action names without a central enum, while still participating in one global map.

## Key elements

- **`deliveryAuditActions`** — A `const` object mapping eight named keys to dotted string identifiers (e.g. `'admin.order.delivered'`). Covers: fulfilment start, shipped, delivered, digital fulfilled, tracking edit, lost, held, released.
- **`declare module '@infrastructure/observability/audit'`** — Augments the shared `AuditActionMap` interface with a `delivery` key whose type is the union of all values in `deliveryAuditActions`. This is the only export surface consumed by other modules.
- **Doc-comment metadata contract** — Specifies which extra fields each action carries in the audit log (e.g. `forced`/`reason` on delivered, `changes.trackingCode {from,to}` on tracking_edited, hold/lost reason codes but never free-text notes, `wasLost` flag on delivered).

## Relationships

- **`src/modules/delivery/services/deliver.ts`** — Emits `ADMIN_ORDER_DELIVERED` (and `wasLost` / `forced` metadata).
- **`src/modules/delivery/services/fulfill.ts`** — Emits `ADMIN_ORDER_FULFILMENT_STARTED` and `ADMIN_ORDER_FULFILLED`.
- **`src/modules/delivery/services/holds.ts`** — Emits `ADMIN_FULFILLMENT_ORDER_HELD` / `ADMIN_FULFILLMENT_ORDER_RELEASED` with the hold reason code.
- **`src/modules/delivery/services/lost.ts`** — Emits `ADMIN_SHIPMENT_LOST` with the loss reason code.
- **`src/modules/delivery/services/ship.ts`** — Emits `ADMIN_ORDER_SHIPPED`.
- **`src/modules/delivery/services/tracking.ts`** — Emits `ADMIN_SHIPMENT_TRACKING_EDITED` with `changes.trackingCode`.
- **`src/modules/delivery/services/process.ts`** — Orchestrates the above; any of the listed actions may be emitted during a processing step.
- **`src/modules/account/audit.ts`** — Referenced in the header comment as the precedent for the augmentation-over-enum pattern.

## Notes

- The pattern is deliberate: actions are declared by *augmentation* into a shared interface rather than living in a central enum. See `modules/account/audit.ts` for the rationale.
- Free-text fields (`holdNote`, `lostNote`, `lostMessage`) are explicitly excluded from audit metadata by convention — only the structured reason code is recorded.
- `ADMIN_ORDER_DELIVERED` metadata `forced` + `reason` represents a sanctioned bypass; `wasLost` is only present when a previously-lost shipment is redelivered.
- The `as const` assertion on `deliveryAuditActions` is what makes the augmented union type precise (literal strings, not `string`).
