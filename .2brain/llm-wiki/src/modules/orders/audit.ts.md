---
source: src/modules/orders/audit.ts
sha256: 38dc0c8bcfb15ccfb6f633eceff653eb409fd2996ac0b5afe1091305074ad9a7
generated_at: 2026-10-29T04:37:31.724690+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/audit.ts

## Purpose

Defines the complete audit-action vocabulary for the orders module and registers it into the app-wide `AuditActionMap` via TypeScript module augmentation. It exists so that every order-lifecycle event (create, update, delete, restore, cancel, export, address correction, status override) carries a typed, centrally-known action string rather than ad-hoc literals scattered across services.

## Key elements

- **`ordersAuditActions`** — `as const` object exporting nine string constants:
  - `ADMIN_ORDER_VIEWED` (`admin.order.viewed`) — staff views a customer's order.
  - `ADMIN_ORDERS_EXPORTED` (`admin.orders.exported`) — orders exported as a file; `metadata` carries filter + row count, never a row.
  - `ORDER_CREATED` (`order.created`) — order created (admin or customer; `actorRole` disambiguates).
  - `ORDER_UPDATED` (`order.updated`)
  - `ORDER_DELETED` (`order.deleted`)
  - `ORDER_RESTORED` (`order.restored`)
  - `ORDER_CANCELLED` (`order.cancelled`) — the one customer-initiated write; `metadata` carries `cause`, `refund`, `paid`.
  - `ORDER_STATUS_OVERRIDDEN` (`order.status_overridden`) — admin skips/corrects lifecycle; `metadata` carries `mode`/`from`/`to`/`reason`.
  - `ADMIN_ORDER_ADDRESS_CORRECTED` (`admin.order.address_corrected`) — address change on an unshipped order; `metadata` never carries the address itself.
- **Module augmentation** (`declare module '@infrastructure/observability/audit'`) — adds `orders` to `AuditActionMap` so the union type includes all nine actions.

## Relationships

- **`services/crud.ts`**, **`services/cancel.ts`**, **`services/remove.ts`**, **`services/override.ts`**, **`services/address.ts`**, **`services/export.ts`** — import `ordersAuditActions` to tag their audit events with the appropriate constant.
- **`controllers/get-order-item.ts`** — imports `ADMIN_ORDER_VIEWED` to record staff order views.
- **`tests/integration/*.test.ts`** (cancel, create-audit, delete-restore-audit, export, shipping-address, update-audit) — exercise the services and assert the correct audit action string is emitted.
- **`tests/cross-cutting/audit-actions-registered.test.ts`** — verifies the module augmentation actually landed in `AuditActionMap`.

## Notes

- **Prefix convention:** Admin-only actions carry the `admin.` prefix; customer-visible actions do not. Disambiguation of *who* performed an action is delegated to `actorRole` on the audit record, not encoded in the action name. This is why `order.created` fires from both an admin write and a customer checkout rather than existing as two separate actions.
- **Not a count metric:** These actions are distinct from `cartCheckoutTotal` / `orderCreatedTotal`, which count route requests. The audit trail records discrete events, not throughput.
- **Design is by augmentation, not shared enum:** The pattern mirrors `modules/account/audit.ts`; each module declares its own action set and merges into the global `AuditActionMap` interface.
