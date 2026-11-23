---
source: src/modules/delivery/services/ship-gate.ts
source_sha256: 6a2c4b21c89ef728dbb1047d3f1285b224ba7d8abb4ea74ee384ad3ef4bd80dc
context_sha256: 1cad8584e9b50eba19f92fcacef7cffff636f0c7c49f554fd1d76a0a78ba7e65
generated_at: 2026-11-22T04:58:49.196331+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/ship-gate.ts

## Purpose
Holds the single order-state question shared by the ship door, the fulfill door and their `actions` flags: may a shipment leave an order in this status? It lives apart from `ship.ts`, `fulfill.ts` (the acts) and `actions.ts` (the flags) so none of them imports another. It also holds the shared "may this caller make the `paid → processing` move" step, since both acts make that move themselves.

## Key elements
- `isOpenForShipment(status, mayStart)` — true if `canShip(status)`, or if the caller may start fulfillment and `canProcessOrder(status)` (the `paid` case). Shipping from `paid` is therefore an ordinary act, not an override.
- `mayStartFulfillment(context)` — returns `holds(context.caller, 'start', 'Shipment')`. Meant to be read before the act's transaction opens, so a transaction retry cannot change it.
- `refuseUnearnedStart(status, mayStart)` — throws an `ActRefusal` wrapping a 403 (`generic.error-forbidden`) when the order is `paid` and the caller lacks `start:Shipment`. Other statuses are left to the gate that follows.
- `auditUnearnedStart(context, reject, fulfillmentOrderId)` — if `reject.status` is 403, calls `auditForbidden` with `targetType: 'fulfillment_order'`, the order id, and metadata `{ reason: 'missing_permission', permission: 'start:Shipment' }`. Other statuses are ignored.

## Relationships
- `@kernel/ability` (`src/kernel/ability.ts`): provides `holds`, used for the `start:Shipment` check.
- `@modules/orders` (`src/modules/orders/index.ts`): provides `canShip` and `canProcessOrder`, the status predicates (defined in the orders domain lifecycle).
- `@infrastructure/http/response`: provides `generateReject` and the `ResponseReject` type.
- `@infrastructure/i18n`: provides `t` for the 403 message.
- `@infrastructure/observability/forbidden`: provides `auditForbidden`, which writes the audit row.
- `./act`: provides `ActRefusal`, the error thrown by `refuseUnearnedStart`.
- `@types`: provides the `CallerContext` and `OrderStatus` types.
- Consumers, per the module doc: `ship.ts`, `fulfill.ts` and `actions.ts`. This file does not import them.

## Notes
- `auditUnearnedStart` is deliberately called after the act, not inside it. A transaction may retry, and the audit row must be written once.
- It checks only `reject.status !== 403` because the act's only 403 is the one from `refuseUnearnedStart`.
- `update:Shipment` alone does not cover the `paid → processing` move. That move needs `start:Shipment`.
