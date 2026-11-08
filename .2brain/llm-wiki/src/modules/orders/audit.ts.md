---
source: src/modules/orders/audit.ts
sha256: 2f44922363ac49fa88d1f47d6335219d9109d787c39378e48ed0762ec29631ff
generated_at: 2026-11-08T06:45:10.490126+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/audit.ts

## Purpose

Declares the audit-action vocabulary for the orders module and registers it into the application-wide `AuditActionMap` via TypeScript module augmentation. Every service and controller in `src/modules/orders/` references one of these constants when it writes an audit record, so the set of valid `orders` actions lives in exactly one place.

## Key elements

- **`ordersAuditActions`** (exported const object) — the full set of action strings this module owns:
  - `ADMIN_ORDER_VIEWED`, `ADMIN_ORDERS_EXPORTED`, `ADMIN_ORDER_ADDRESS_CORRECTED`, `ADMIN_ORDER_NOTE_ADDED`, `ADMIN_ORDER_NOTE_DELETED` — admin/staff-only actions (prefixed `admin.`).
  - `ORDER_CREATED`, `ORDER_UPDATED`, `ORDER_DELETED`, `ORDER_RESTORED`, `ORDER_CANCELED`, `ORDER_STATUS_OVERRIDDEN` — lifecycle actions that can originate from either a customer or an admin; the `actorRole` field on the record disambiguates.
- **`declare module '@infrastructure/observability/audit'`** — augments the shared `AuditActionMap` interface so `orders` is a valid module key typed to this object's values.

## Relationships

- **Services** (`cancel.ts`, `crud.ts`, `export.ts`, `override.ts`, `remove.ts`, `address.ts`, `timeline.ts`) — each emits the corresponding constant from `ordersAuditActions` when it performs its mutation. For example, `cancel.ts` emits `ORDER_CANCELED`; `override.ts` emits `ORDER_STATUS_OVERRIDDEN`; `export.ts` emits `ADMIN_ORDERS_EXPORTED`.
- **Controller** (`get-order.ts`) — emits `ADMIN_ORDER_VIEWED` when staff open another customer's order.
- **Integration tests** (`create-audit.test.ts`, `update-audit.test.ts`, `delete-restore-audit.test.ts`, `cancel.test.ts`, `export.test.ts`, `notes.test.ts`, `shipping-address.test.ts`) — assert that the correct action string and metadata shape are written for each scenario.

## Notes

- Actions use a flat string union (not a shared enum). Module augmentation is the registration mechanism; see `src/modules/account/audit.ts` for the pattern.
- No `user.` / `admin.` prefix on lifecycle actions (`order.*`): the `actorRole` field on the audit record already records who acted, so a single `order.created` covers both admin writes and customer checkout.
- **Metadata privacy convention (enforced by comment, not type):** `ADMIN_ORDER_EXPORTED` carries filter + row count, never row data. `ADMIN_ORDER_ADDRESS_CORRECTED` never carries the address. `ADMIN_ORDER_NOTE_ADDED`/`_DELETED` carry the note id and text **length**, never the text itself. `ORDER_CANCELED` carries `cause`, `refund`, and `paid` booleans.
- These audit records are distinct from the route-level counters `cartCheckoutTotal` / `orderCreatedTotal`, which count HTTP requests, not order entities.
