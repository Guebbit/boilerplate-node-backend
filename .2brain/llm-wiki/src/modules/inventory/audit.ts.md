---
source: src/modules/inventory/audit.ts
sha256: bd15c6221772fea8ae28626a0adfeeadc267760e98cd0810c677e51f3033c304
generated_at: 2026-10-15T10:33:25.492004+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/audit.ts

## Purpose

Declares the inventory module's audit-action vocabulary and registers it into the app-wide `AuditActionMap` via TypeScript module augmentation. It exists so that every inventory-specific audit event is a typed, centralized constant rather than an ad-hoc string scattered across service files. The module doc comment records the design rationale: lifecycle transitions (reserve, commit, release, expire) are audited by their owning callers (checkout, payment, cancellation), so this module only owns actions that are consequences of an admin operation or an invariant failure local to inventory itself.

## Key elements

- **`inventoryAuditActions`** — `as const` object listing the five audit actions this module owns:
  - `ADMIN_STOCK_RECEIVED` (`admin.stock.received`)
  - `ADMIN_STOCK_ADJUSTED` (`admin.stock.adjusted`)
  - `ADMIN_RESERVATIONS_SWEPT` (`admin.reservations.swept`)
  - `ADMIN_COMMIT_ORPHANED` (`admin.commit.orphaned`)
  - `ADMIN_PREORDER_LIMIT_SET` (`admin.preorder.limit.set`)
- **`declare module '@infrastructure/observability/audit'`** — module augmentation that adds an `inventory` key to the global `AuditActionMap` interface, typed as the union of the five action string literals.

## Relationships

- **`src/modules/inventory/services/admin.ts`** — the primary consumer of the stock-received, stock-adjusted, and preorder-limit actions emitted during admin inventory operations.
- **`src/modules/inventory/services/holds.ts`** — the caller whose `commitForOrder` path emits `ADMIN_COMMIT_ORPHANED` when no hold is found to claim (the one invariant-failure case owned here rather than by the caller).
- **`src/modules/inventory/services/sweep.ts`** — emits `ADMIN_RESERVATIONS_SWEPT` after expiring stale reservations.
- **`src/modules/inventory/tests/integration/service.test.ts`** — integration tests that assert the correct audit action strings are recorded for each of the above flows.

## Notes

- The augmentation pattern (rather than a shared enum) is deliberate and mirrors `modules/account/audit.ts`; see the doc comment reference for the rationale.
- `ADMIN_COMMIT_ORPHANED` is the *only* lifecycle-adjacent action audited by this module. All other lifecycle transitions are audited by whichever service initiates them. Do not add lifecycle actions here without re-reading that comment.
- Adding a new action requires updating both the `inventoryAuditActions` object and (implicitly) the augmented interface — TypeScript enforces this, so a forgotten `as const` entry or missing augmentation will surface at compile time.
