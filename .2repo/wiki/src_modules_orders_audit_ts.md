# src/modules/orders/audit.ts

## Purpose

Declares the audit-action vocabulary for the orders module and registers it into the app-wide `AuditActionMap` via TypeScript module augmentation. It contains no runtime logic — only the constant string values that other modules emit as structured audit events.

## Key elements

- **`ordersAuditActions`** (const object) — The four action strings this module owns: `order.created`, `order.updated`, `order.deleted`, `order.cancelled`. Used by callers when they emit an audit record.
- **`declare module '@infrastructure/observability/audit'`** augmentation — Adds an `orders` key to the shared `AuditActionMap` interface so the action strings are type-checked wherever the map is consumed.

## Relationships

- **`src/modules/orders/service.ts`** — Emits `ORDER_CREATED`, `ORDER_UPDATED`, and `ORDER_CANCELLED` actions through the audit pipeline; consumes the constants from this file.
- **`src/modules/orders/controllers/delete-orders.ts`** — Emits `ORDER_DELETED` when an order record is removed.
- **`src/modules/orders/tests/unit/audit.test.ts`** — Unit-tests the action vocabulary (string values, type-surface of the augmentation).
- **`src/modules/orders/tests/integration/cancel.test.ts`** — Integration-tests the `ORDER_CANCELLED` flow, asserting the correct action string appears in the audit trail.

## Notes

- **No role prefix.** Actions are role-agnostic (`order.created`, not `admin.order.created` / `user.order.created`). The `actor_role` field on each audit record disambiguates who performed the action.
- **Not a route counter.** These audit events are distinct from `cartCheckoutTotal` / `orderCreatedTotal`, which are metrics that count inbound route requests. An `order.created` audit record is written when an order row is actually persisted.
- **Augmentation, not a shared enum.** The pattern mirrors `modules/account/audit.ts`: each domain module declares its own actions and augments the central `AuditActionMap` interface rather than importing from a single global enum.
- **`ORDER_CANCELLED` is the only customer-initiated order write.** The module doc calls this out because the audit record (with `actor_role`) is what later tells support whether the customer or the shop initiated the cancellation.
