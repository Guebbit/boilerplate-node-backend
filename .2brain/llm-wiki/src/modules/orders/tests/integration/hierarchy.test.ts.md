---
source: src/modules/orders/tests/integration/hierarchy.test.ts
source_sha256: ad02c98ccd6d394a74934c2cca4e28f1434b61f0ec13a5c45e1550795cec7da4
context_sha256: c10e58e4e4ca061bd5d8ad8925c391e837a77ba95815d3dae78b5727cc954024
generated_at: 2026-11-22T06:28:31.675665+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/hierarchy.test.ts

## Purpose
Integration tests for who may change which order, driven through the order service with one test cell per caller role and buyer role. The file's rule is that the write's own scope decides cancel access, not read access. Warehouse and support accounts can read every order but cannot cancel one, and a customer cancels only their own. Operators holding the key (moderator, manager, admin) handle any order, including staff members' and their own, because "a role is only a bundle of keys" and there is no rank between roles.

## Key elements
- **`orderOf(role, status?)`**: helper that creates a buyer holding `role`, a product, and a `pending` order (or the given status).
- **`statusOf(id)`**: reads the stored status through `orderRepository.findById`. Used to check that a refused action left the order unchanged.
- **`actionsFor(orderId, role, callerId)`**: loads an order with `orderService.getById`, runs `orderService.withActions` for the caller, and returns the `cancel`, `pay`, `recordPayment`, `process` and `overrideStatus` flags.
- **`STAFF_ID`**: a valid ObjectId that matches no account, used as the caller id for staff roles.
- **`describe('cancelOnRequestById — the write’s own scope')`**:
  - warehouse and support are refused with `success: false` and status 404, and the order stays `pending`.
  - A warehouse is refused on a paid order too, which leaves it `paid` and writes no `ORDER_CANCELED` outbox row.
  - A customer can cancel their own order.
  - moderator, manager and admin can cancel a customer's order.
- **`describe('what an order offers each caller — what a client renders')`**: checks the `actions` flags.
  - The buyer gets `cancel` and `pay` on a pending order.
  - warehouse and support get neither.
  - Operators get `cancel` on customer and staff orders alike, and `process` on paid orders.
  - `recordPayment` (offline payment) is offered to an admin on an unpaid customer order, where `pay` stays false for the admin. It is offered to a buyer on their own order whatever role they hold. It is withheld once the order is paid and from roles without the key.
  - `pay` is offered to staff and admin buyers on their own pending orders.
- **`describe('no rank on an order')`**:
  - A table of caller/buyer role pairs shows `cancelOnRequestById` succeeding for all of them.
  - An operator can `updateById`, `removeById` and `restoreById` a staff member's order. The test uses `forceOrderStatus(id, 'canceled')` first, because only a canceled order can be hidden.
  - An admin can update their own order.
  - An audit test checks that a moderator's cancel carries `ownOrder` when the moderator is the buyer.
  - The visible part of the file ends partway through that audit test.

## Relationships
- `@modules/orders/services` (`orderService`): the system under test, via `cancelOnRequestById`, `getById`, `withActions`, `updateById`, `removeById` and `restoreById`.
- `../../services/cancel`: imports `cancelForErasureById`, though the visible portion does not use it.
- `../../repository` (`orderRepository`): used to read stored status.
- `../../events` (`ORDER_CANCELED`) and `@kernel/outbox` (`outboxEventModel`): used to assert that a refused cancel writes no outbox row.
- `@infrastructure/observability/audit`: the module is mocked with `auditPortMock()` from `tests/support/ports.ts`, and `observePort` watches `emitAuditEvent` calls.
- `tests/support/callers.ts` (`asRole`, `callerContextAs`): builds the caller identity and context for a role and id.
- `tests/support/setup-test-db.ts` (`setupTestDb`): sets up the test database.
- `@modules/users/tests/factories`, `@modules/products/tests/factories` and `@modules/orders/tests/factories`: `createUser`, `createProduct`, `createOrder`, `toOrderItem` and `forceOrderStatus` provide the fixtures.
- `@types` (`OrderStatus`): the status enum.

## Notes
- The audit module is replaced rather than spied on. The file points to `tests/support/ports.ts` for the reason.
- Refusals come back as a 404 result, not a thrown error.
- Roles used as buyers and callers include `customer`, `unverified`, `support`, `warehouse`, `moderator`, `manager` and `admin`.
- Own money is "trusted and recorded, not refused": a buyer who holds an admin or staff role can still record an offline payment on their own order, and the audit row carries `ownOrder`.
