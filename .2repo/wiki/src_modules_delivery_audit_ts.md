# src/modules/delivery/audit.ts

## Purpose

Declares the set of audit actions the delivery module is allowed to emit, and registers them into the global `AuditActionMap` via TypeScript declaration merging. It exists as a side-effect module (no runtime import needed beyond the type augmentation) so that audit emissions are statically typed rather than free-form strings.

## Key elements

- **`deliveryAuditActions`** (exported const) — The sole action is `ADMIN_COURIER_ADVANCED` (`'admin.courier.advanced'`). Shipment creation is deliberately *not* listed here because it is audited as part of the admin order-status write, not as a delivery-specific event.
- **`declare module '@infrastructure/observability/audit'`** — Augments the shared `AuditActionMap` interface so that the key `delivery` maps to the union of values in `deliveryAuditActions`. This gives downstream audit emitters type-safety without a shared enum file.

## Relationships

- **`src/modules/delivery/service.ts`** — The delivery service is the runtime producer of these audit events. It references `deliveryAuditActions` (or the literal strings) when it emits the courier-advanced audit record.

## Notes

- Follows the same augmentation pattern as `src/modules/account/audit.ts`; the comment explicitly points there for the rationale (per-module action declarations instead of a centralized enum).
- The file has no runtime side effects beyond the `const` export; its primary job is the type-level `declare module` block. Consumers only need to import the type, not the value, in most cases.
- Adding a new delivery audit action means adding a key to `deliveryAuditActions` — the `AuditActionMap` union picks it up automatically via `keyof typeof`.
