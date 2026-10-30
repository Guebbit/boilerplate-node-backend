---
source: src/modules/inventory/audit.ts
sha256: 078ecdeb73dc2f1cae03f078dccc224bc40d6bf615be4c954b1cc45a26986639
generated_at: 2026-10-29T03:59:00.234585+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/audit.ts

## Purpose

Declares the inventory module's audit-action vocabulary and registers it into the app-wide `AuditActionMap` via TypeScript declaration merging. It exists so that inventory-specific audit events have a single, typed source of truth without introducing a cross-module shared enum (the rationale for the augmentation pattern is documented in `modules/account/audit.ts`).

## Key elements

- **`inventoryAuditActions`** — a `const` object listing the five actions this module owns: `admin.stock.received`, `admin.stock.adjusted`, `admin.reservations.swept`, `admin.commit.orphaned`, `admin.backorder.limit.set`.
- **`declare module '@infrastructure/observability/audit'`** — augments the `AuditActionMap` interface so `inventory` resolves to the union of the above string literals, giving callers compile-time exhaustiveness.

## Relationships

- **`src/modules/inventory/services/admin.ts`** — emits `ADMIN_STOCK_RECEIVED`, `ADMIN_STOCK_ADJUSTED`, and `ADMIN_BACKORDER_LIMIT_SET` using the constants defined here.
- **`src/modules/inventory/services/holds.ts`** — emits `ADMIN_COMMIT_ORPHANED` when `commitForOrder` finds no hold to claim; this is the one lifecycle outcome audited by the inventory module itself rather than by the upstream caller.
- **`src/modules/inventory/services/sweep.ts`** — emits `ADMIN_RESERVATIONS_SWEPT` when it purges expired reservations.
- **`src/modules/inventory/tests/integration/preorder.test.ts` / `service.test.ts`** — assert that the expected audit actions are emitted during checkout, payment, and cancellation flows.

## Notes

- The five actions are deliberately *not* lifecycle transitions (reserve, commit, release, expire). Those are audited by their originating callers (checkout, payment, cancellation) which already write a ledger row naming the order. The exception is `admin.commit.orphaned`, which represents an invariant failure local to this module and therefore has no other owner.
- New actions should be added here, not in the service files, so the `AuditActionMap` union stays exhaustive and type-safe across the codebase.
