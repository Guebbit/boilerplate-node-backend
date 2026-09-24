---
source: src/modules/orders/audit.ts
sha256: eb3405750beea01a7011768fc33fe7fe610db7ca1783689134a3c83dd2419903
generated_at: 2026-09-23T18:59:39.546573+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/audit.ts

## Purpose

Declares the audit-action vocabulary for the orders module and registers it into the app-wide `AuditActionMap` via TypeScript module augmentation. It exists so that every order write-path (create, update, delete, cancel, status-override) records a typed, enumerable action in the audit trail without a shared enum.

## Key elements

- **`ordersAuditActions`** (exported const object) — the five action strings this module owns:
    - `ORDER_CREATED` (`order.created`) — fired on any new order, regardless of actor role.
    - `ORDER_UPDATED` (`order.updated`)
    - `ORDER_DELETED` (`order.deleted`)
    - `ORDER_CANCELLED` (`order.cancelled`) — the one write a customer performs; `actor_role` on the record distinguishes customer vs. shop.
    - `ORDER_STATUS_OVERRIDDEN` (`order.status_overridden`) — admin lifecycle bypass; `metadata` carries `mode`/`from`/`to`/`reason`.
- **`declare module '@infrastructure/observability/audit'`** — augments `AuditActionMap` with an `orders` key typed as the union of the above values, making the actions available app-wide without a runtime import cycle.

## Relationships

- **`services/crud.ts`** — emits `ORDER_CREATED` and `ORDER_UPDATED` when performing order writes.
- **`services/cancel.ts`** — emits `ORDER_CANCELLED`.
- **`services/override.ts`** — emits `ORDER_STATUS_OVERRIDDEN` (attaching `mode`/`from`/`to`/`reason` to metadata).
- **`controllers/delete-orders.ts`** — emits `ORDER_DELETED`.
- **`tests/unit/audit.test.ts`** and **`tests/integration/create-audit.test.ts`** / **`cancel.test.ts`** — assert the correct action string lands in the audit record for each path.
- **`tests/cross-cutting/audit-actions-registered.test.ts`** — verifies the `AuditActionMap` augmentation actually registers `orders` at the type level.

## Notes

- Actions deliberately carry **no** `admin.`/`user.` prefix; the `actor_role` field on every audit record is the sole discriminator of _who_ performed the write.
- These action strings are **not** the same as `cartCheckoutTotal` / `orderCreatedTotal`, which are route-level request counters in a different subsystem.
- Follows the same augmentation pattern as `modules/account/audit.ts` — each module owns its own `as const` object and merges it into the shared `AuditActionMap`, avoiding a central enum file.
