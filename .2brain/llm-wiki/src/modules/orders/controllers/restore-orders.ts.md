---
source: src/modules/orders/controllers/restore-orders.ts
sha256: a906990fd252d0dd263d448d507a2556be216777e064f8905f1decf3a86694f8
generated_at: 2026-09-27T15:08:25.936909+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/restore-orders.ts

## Purpose

Thin admin controller that exposes the **POST /orders/:id/restore** endpoint for undoing a soft-deleted order. Rather than implementing the handler inline, it delegates all logic (lookup, permission check, audit, response shaping) to the shared `createRestoreController` factory, keeping the orders module consistent with other entities that follow the same restore pattern.

## Key elements

- **`restoreOrders`** (default export) — The wired controller instance produced by `createRestoreController`. Accepts and configures:
  - `entity: 'order'` — label used in generic error/audit messages.
  - `restore(id)` — calls `orderService.restoreById(id)` to perform the actual state transition.
  - `present(order, request)` — re-hydrates the order with its currently available actions via `orderService.withActions(order, request.authContext)` so the response reflects the caller's permissions.
  - `auditAction: ordersAuditActions.ORDER_RESTORED` — the audit-log entry emitted on success.
  - `notFoundKey: 'orders.not-found'` — i18n key for the 404 body.

## Relationships

- **`create-restore-controller.ts`** — Supplies the `createRestoreController` factory; this file is a pure configuration of that factory for the order entity.
- **`services/index.ts`** — Source of `orderService`, which provides `restoreById` (state change) and `withActions` (permission-aware shaping).
- **`audit.ts`** — Provides the `ordersAuditActions.ORDER_RESTORED` constant used as the audit-log action name.
- **`routes.ts`** — Registers `restoreOrders` under the `POST /orders/:id/restore` route (this file is the handler that routes dispatches to).

## Notes

- Returns **409 Conflict** (not 400) when the order exists but is *not* in a deleted state — "restore" is only valid as the inverse of a delete.
- The response payload is not the raw row; `withActions` augments it with a list of actions the caller is permitted to take, so the shape is auth-context-dependent.
- No additional validation or transaction logic lives here — the service layer owns those concerns.
