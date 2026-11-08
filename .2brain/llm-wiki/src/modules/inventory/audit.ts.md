---
source: src/modules/inventory/audit.ts
sha256: 078ecdeb73dc2f1cae03f078dccc224bc40d6bf615be4c954b1cc45a26986639
generated_at: 2026-11-08T05:56:48.182302+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/audit.ts

## Purpose

Defines the inventory module's audit-action vocabulary and registers those actions into the app-wide `AuditActionMap` via TypeScript module augmentation. It exists so that admin-facing inventory operations (stock changes, sweeps, orphaned commits, backorder limits) emit typed, discoverable audit events without sharing a global enum — following the same pattern as `modules/account/audit.ts`.

## Key elements

- **`inventoryAuditActions`** — `as const` object with five string values (`admin.stock.received`, `admin.stock.adjusted`, `admin.reservations.swept`, `admin.commit.orphaned`, `admin.backorder.limit.set`). All are `ADMIN_*` prefixed because lifecycle transitions (reserve, commit, release, expire) are audited by their own callers, not here.
- **`declare module '@infrastructure/observability/audit'`** — Augments the `AuditActionMap` interface with an `inventory` key typed as the union of the five action strings, making them available to the generic audit infrastructure.

## Relationships

- **`services/admin.ts`** — Emits `ADMIN_STOCK_RECEIVED`, `ADMIN_STOCK_ADJUSTED`, and `ADMIN_BACKORDER_LIMIT_SET` using the constants defined here.
- **`services/holds.ts`** — Emits `ADMIN_COMMIT_ORPHANED` when `commitForOrder` finds no hold to claim (the module's own invariant failure, audited here rather than by the caller).
- **`services/sweep.ts`** — Emits `ADMIN_RESERVATIONS_SWEPT` after expiring stale reservations.
- **`tests/integration/preorder.test.ts`** and **`tests/integration/service.test.ts`** — Assert that the above services emit the correct audit actions in their integration scenarios.

## Notes

- The design intentionally does **not** audit normal lifecycle transitions (reserve/commit/release/expire) here; those belong to the caller's audit. The sole exception is `ADMIN_COMMIT_ORPHANED`, because the "no hold found" case has no external owner — it is this module's own invariant failing.
- Uses module augmentation rather than a shared enum so each module owns its action vocabulary; see the doc-comment cross-reference to `modules/account/audit.ts` for the rationale.
