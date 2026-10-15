---
source: src/modules/orders/audit.ts
sha256: 9d816a7621d297c7d6d10e5b54a860b28be839f14b2d5f7bb8b8932abe013468
generated_at: 2026-10-15T10:58:40.732736+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/audit.ts

## Purpose

Declares the audit-action vocabulary owned by the orders module and registers it into the app-wide `AuditActionMap` via TypeScript module augmentation. No runtime logic — it is purely a set of string constants and a type-level declaration that lets the observability layer type-check order-specific audit events.

## Key elements

- **`ordersAuditActions`** (const object) — the eight action identifiers this module emits:
  - `ADMIN_ORDER_VIEWED` (`admin.order.viewed`) — staff opened another user's order (the only wide-read action).
  - `ADMIN_ORDERS_EXPORTED` (`admin.orders.exported`) — orders left the app as a file; `metadata` carries filter + row count, never row data.
  - `ORDER_CREATED` / `ORDER_UPDATED` / `ORDER_DELETED` / `ORDER_RESTORED` — standard lifecycle writes.
  - `ORDER_CANCELLED` (`order.cancelled`) — the one customer-initiated write; `actorRole` distinguishes customer vs. shop.
  - `ORDER_STATUS_OVERRIDDEN` (`order.status_overridden`) — admin bypassed the normal lifecycle; `metadata` carries mode/from/to/reason.
- **`declare module '@infrastructure/observability/audit'`** — augments `AuditActionMap` with an `orders` key typed as the union of all values above, so the audit infrastructure can type-check these actions app-wide.

## Relationships

This file is a **leaf** in the dependency graph: it imports nothing. All listed neighbors are **consumers** — the services (`crud.ts`, `cancel.ts`, `remove.ts`, `override.ts`, `export.ts`) and controller (`get-order-item.ts`) reference `ordersAuditActions` by value when emitting audit records. The integration tests (`create-audit.test.ts`, `cancel.test.ts`, `delete-restore-audit.test.ts`, `export.test.ts`) and the cross-cutting test (`audit-actions-registered.test.ts`) import the constant to assert that the expected action string is actually written to the audit trail.

## Notes

- **No `admin.`/`user.` prefix on lifecycle actions.** The `actorRole` field on every audit record already records who acted; `order.created` fires for both an admin write and a customer checkout. Only genuinely admin-only actions (`ADMIN_ORDER_VIEWED`, `ADMIN_ORDERS_EXPORTED`) carry the `admin.` prefix.
- **Distinct from `cartCheckoutTotal` / `orderCreatedTotal`.** Those are route-request counters, not entries in this audit trail.
- **Augmentation pattern.** Following the convention set by `modules/account/audit.ts`, actions are declared here and merged into the shared map rather than living in a central enum — adding a new order action requires editing only this file.
