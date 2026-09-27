---
source: src/modules/delivery/audit.ts
sha256: f17ab8752a051d898b58c14e6163d9d5d9a62e20b2e7752d4f8e32b737f0ed02
generated_at: 2026-09-27T14:49:06.107681+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/audit.ts

## Purpose

Declares the four audit-action string constants that the delivery domain emits and registers them into the shared `AuditActionMap` interface via TypeScript module augmentation. This keeps the audit vocabulary colocated with the domain that produces it while remaining visible to the global observability infrastructure.

## Key elements

- **`deliveryAuditActions`** (exported, `as const`) — The four action identifiers staff actions write through: `ADMIN_ORDER_FULFILMENT_STARTED`, `ADMIN_ORDER_SHIPPED`, `ADMIN_ORDER_DELIVERED`, and `ADMIN_ORDER_FULFILLED`. Values are dot-namespaced strings under `admin.order.*`.
- **`declare module '@infrastructure/observability/audit'`** — Augments the `AuditActionMap` interface with a `delivery` key typed to the union of the values above, making these actions part of the global audit-action surface.

## Relationships

- **`src/modules/delivery/service.ts`** — The delivery service module that performs fulfilment, shipping, delivery, and digital-only fulfilment. It is the expected consumer/emitter of these action constants when writing audit entries.

## Notes

- The file intentionally uses **module augmentation** rather than importing from a shared enum. The JSDoc points to `modules/account/audit.ts` as the precedent for this pattern; follow that convention when adding new domain audit files.
- The `as const` assertion is load-bearing: it gives each value a literal type and makes the union in the augmentation precise. Do not widen the object to `Record<string, string>`.
- `ADMIN_ORDER_FULFILLED` covers the digital-only (no-parcel) path and is distinct from the physical `SHIPPED` / `DELIVERED` flow.
