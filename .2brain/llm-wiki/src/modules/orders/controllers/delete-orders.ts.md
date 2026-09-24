---
source: src/modules/orders/controllers/delete-orders.ts
sha256: 16323fa2e42eccfdebf2e5e2691d967e519e3ee04f95784ca3a9f1e86536feb3
generated_at: 2026-09-23T19:00:04.365946+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/delete-orders.ts

## Purpose

Thin wiring layer that instantiates the shared `createDeleteController` factory for the order entity. It exists so the orders module can expose a single, pre-configured `deleteOrders` controller (soft-delete by default, hard-delete on demand) without re-implementing the delete logic.

## Key elements

- **`deleteOrders`** (exported constant) — The admin DELETE controller. Accepts an order id, delegates removal to `orderService.removeById(id, hardDelete)`, and records the action under `ordersAuditActions.ORDER_DELETED`. The `hardDelete` flag is triggered by a `/hard` suffix or `?hardDelete=true` query param.

## Relationships

- **`src/infrastructure/surfaces/create-delete-controller.ts`** — Supplies the `createDeleteController` factory. This file only configures it (entity name, remove callback, audit action, i18n key); all HTTP parsing, auth guard, and response shaping live in the factory.
- **`src/modules/orders/services/index.ts`** — Provides `orderService.removeById(id, hardDelete)`, the actual persistence call the controller invokes.
- **`src/modules/orders/audit.ts`** — Exports `ordersAuditActions.ORDER_DELETED`, the audit-log action identifier stamped when a delete succeeds.
- **`src/modules/orders/routes.ts`** — Consumer side; mounts `deleteOrders` on the `DELETE /orders(/:id)(/hard)` route.

## Notes

- Soft vs. hard semantics are **domain-level**, not generic: hard delete releases the order's held inventory units before removing the row; soft delete only sets a deletion timestamp because an order is a financial record. This distinction is enforced in `orderService.removeById`, not in this controller.
- The controller itself contains no validation, auth, or HTTP logic — those are inherited from `createDeleteController`. If behavior seems "missing," look in the factory.
- `notFoundKey: 'orders.not-found'` is an i18n lookup key; a miss returns the standard 404 message defined elsewhere in the translation catalog.
