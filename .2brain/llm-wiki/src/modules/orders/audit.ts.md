---
source: src/modules/orders/audit.ts
sha256: 601c5440f9be476c11762c7ab6bcb0ab36873f781c999c396e4c3f9234f0a8d3
generated_at: 2026-09-27T15:06:35.145317+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/audit.ts

## Purpose

Declares the audit-action vocabulary owned by the orders module and registers it into the app-wide `AuditActionMap` via TypeScript module augmentation. Centralizing the action strings here (instead of scattering them across services and controllers) gives a single source of truth for what "orders did something" means in the audit trail.

## Key elements

- **`ordersAuditActions`** (exported const object) — the six action identifiers this module emits:
  - `ORDER_CREATED` / `ORDER_UPDATED` / `ORDER_DELETED` / `ORDER_RESTORED` — standard lifecycle events.
  - `ORDER_CANCELLED` — the one customer-initiated order write; audited because it determines financial responsibility.
  - `ORDER_STATUS_OVERRIDDEN` — admin bypass of the normal lifecycle; the record's `metadata` carries `mode`, `from`, `to`, `reason`.
- **`declare module '@infrastructure/observability/audit'`** — augments the `AuditActionMap` interface with an `orders` key typed as the union of all values in `ordersAuditActions`.

## Relationships

- **services & controllers (crud, cancel, override, delete-orders, restore-orders)** — import `ordersAuditActions` to pass the correct action string when emitting audit records for their respective operations.
- **`@infrastructure/observability/audit`** — the augmented interface lives here; this file is one of many modules that contribute keys to `AuditActionMap` (see `modules/account/audit.ts` for the same pattern).
- **tests** (`create-audit.test.ts`, `cancel.test.ts`) — assert that the expected action string from this file appears on the emitted audit record.
- **`tests/cross-cutting/audit-actions-registered.test.ts`** — verifies that every key in `ordersAuditActions` is resolvable through the global `AuditActionMap` union.

## Notes

- **No role prefix in action names.** Deliberately *not* `admin.order.created` vs `customer.order.created`; the `actor_role` field on each audit record disambiguates who performed the action. Adding role-specific actions would double the vocabulary without adding information.
- **Not a shared enum.** The pattern is augmentation of `AuditActionMap` per module, not a central enum file. Adding a new action here means both adding a key to `ordersAuditActions` *and* ensuring any consumer that switches on the union handles the new literal.
- **Distinct from metrics.** `order.created` (this file) records *who did what, to which order*. Metrics like `orderCreatedTotal` count route-level requests and live in a different subsystem.
