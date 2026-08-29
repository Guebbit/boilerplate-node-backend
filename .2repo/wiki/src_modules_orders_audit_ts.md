# src/modules/orders/audit.ts

## Purpose

Declares the set of audit action names for the orders module and registers them into the global `AuditActionMap` via TypeScript module augmentation. It exists so that every order-related write can be tagged with a well-known, type-safe action string in audit records.

## Key elements

- **`ordersAuditActions`** (const object) — four action strings: `order.created`, `order.updated`, `order.deleted`, `order.cancelled`. Exported for use by services and controllers that emit audit records.
- **Module augmentation** (`declare module '@infrastructure/observability/audit'`) — adds an `orders` key to `AuditActionMap`, mapping to the union of values in `ordersAuditActions`. Makes the strings usable in a type-safe position within the audit infrastructure.

## Relationships

- **`src/modules/orders/service.ts`** — consumes `ordersAuditActions` (e.g. `ORDER_CREATED`, `ORDER_UPDATED`) when recording audit entries for create/update operations.
- **`src/modules/orders/controllers/delete-orders.ts`** — consumes `ORDER_DELETED` when a delete request is processed.
- **`src/modules/orders/tests/unit/audit.test.ts`** — unit-tests the exported constants and the augmentation.
- **`src/modules/orders/tests/integration/cancel.test.ts`** — integration-tests the `ORDER_CANCELLED` flow end-to-end.

## Notes

- No `admin.` / `user.` prefix on any action name. The `actor_role` field on the audit record already distinguishes who acted; prefixing the name would duplicate that fact.
- `order.created` is a single event for both an admin creating an order directly (`orderService.create`) and a customer checkout (`orderService.recordCreated`). The two paths are differentiated solely by `actor_role` on the record.
- These action names are **not** the same as the metrics `cartCheckoutTotal` / `orderCreatedTotal` (request counters on two different routes). Do not conflate them.
- The augmentation pattern (instead of a shared enum) is intentional and mirrors the convention established in `modules/account/audit.ts`.
