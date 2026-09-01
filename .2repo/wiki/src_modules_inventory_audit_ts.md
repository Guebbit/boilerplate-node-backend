# src/modules/inventory/audit.ts

## Purpose

Declares the inventory module's audit-action vocabulary and registers it into the app-wide `AuditActionMap` via TypeScript module augmentation. Only three admin-initiated actions are defined here because lifecycle transitions (reserve, commit, release, expire) are audited by the originating domain (checkout, payment, cancellation), each of which leaves its own ledger row.

## Key elements

- **`inventoryAuditActions`** (exported const) — Three action identifiers: `admin.stock.received`, `admin.stock.adjusted`, `admin.reservations.swept`.
- **Module augmentation of `AuditActionMap`** — Adds an `inventory` key to the interface in `@infrastructure/observability/audit`, making these actions available in the global union without a shared enum.

## Relationships

- **`src/modules/inventory/service.ts`** — The inventory service is the primary consumer of these action identifiers when recording audit entries for stock receipt, adjustment, and reservation sweeps.
- **`@infrastructure/observability/audit`** — The augmented `AuditActionMap` interface lives here; this file contributes the `inventory` member to that union.
- **`modules/account/audit.ts`** — Referenced in the doc comment as the precedent for using declaration augmentation (rather than a shared enum) to compose per-module action namespaces.

## Notes

- The augmentation pattern is intentional and repeated across modules (see `modules/account/audit.ts` for the rationale). Do not replace it with a shared enum.
- The action strings are namespaced with the `admin.` prefix, signalling they represent operator-initiated operations, not user-facing checkout flows.
- The module doc comment points to `docs/modules/inventory.md` for broader context on inventory auditing.
