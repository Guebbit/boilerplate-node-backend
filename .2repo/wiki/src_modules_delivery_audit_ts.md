# src/modules/delivery/audit.ts

## Purpose

Declares the single audit action used by the delivery module and registers it into the global `AuditActionMap` via a TypeScript module augmentation. It exists so that audit events emitted by delivery code are type-checked against a closed set of allowed action strings, consistent with the pattern established in `modules/account/audit.ts`.

## Key elements

- **`deliveryAuditActions`** (const object) — The one audit action for this module: `ADMIN_COURIER_ADVANCED` → `'admin.courier.advanced'`. Represents the courier tick, the only request-shaped operation delivery performs.
- **`declare module '@infrastructure/observability/audit'`** — Augments `AuditActionMap` with a `delivery` key typed as the value union of `deliveryAuditActions`, making the action available to the shared audit infrastructure without a runtime import.

## Relationships

- **`src/modules/delivery/service.ts`** — The sole consumer. It imports `deliveryAuditActions` and passes the `ADMIN_COURIER_ADVANCED` action string when emitting audit events for the courier tick. No other delivery operations produce audit records here; shipment creation is audited by the admin order-write path instead.

## Notes

- The augmentation pattern (rather than a shared enum) is deliberate and mirrors `modules/account/audit.ts`; do not "simplify" it into a common constants file.
- There is intentionally only **one** action. Shipment creation does not get its own audit action because it rides the order status change already audited by the admin order write.
