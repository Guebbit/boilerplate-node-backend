---
source: src/modules/orders/tests/integration/hierarchy.test.ts
sha256: ed0edf0e997cb0adf54afcf329e3eb69478a29fb1a80a8d43cf0fc49022337d6
generated_at: 2026-11-08T07:05:17.326614+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/hierarchy.test.ts

## Purpose

Integration tests that verify the authorization model for order writes and action visibility. The core invariant: a read key (e.g. `display:Order`) never implies a write key (e.g. `update:Order`), a customer can cancel only their own order, and an operator holding the write key handles any buyer's order regardless of the buyer's role. Roles are treated as flat bundles of keys with no rank hierarchy.

## Key elements

- **`STAFF_ID`** — a valid ObjectId that corresponds to no account; used as the caller identity for all operator-role tests ("a caller nobody owns anything for").
- **`orderOf(role, status?)`** — helper that creates a user with the given role, a product, and a pending (or specified-status) order, returning the order.
- **`statusOf(id)`** — reads the stored `order.status` to confirm a refused operation left it unchanged.
- **`actionsFor(orderId, role, callerId)`** — fetches an order, calls `orderService.withActions`, and extracts the five boolean action fields (`cancel`, `pay`, `recordPayment`, `process`, `override`).
- **`describe('cancelOnRequestById — the write's own scope')`** — asserts warehouse/support are refused (404) on pending and paid orders, that a refused cancel writes no `ORDER_CANCELED` outbox row, that the customer can cancel their own order, and that moderator/manager/admin succeed on any customer order.
- **`describe('what an order offers each caller')`** — asserts the action surface each role sees: buyer gets `cancel`+`pay`; warehouse/support get neither; operator gets `cancel` on any order; `recordPayment` is operator-only and withheld once paid; `pay` is always available to the buyer even if they also hold an operator role.
- **`describe('no rank on an order')`** — parameterised caller×buyer matrix proving every operator role cancels every buyer role's order; operator can `updateById`/`removeById`/`restoreById` a staff member's order; an admin handles their own order; audit `ownOrder` flag is `true` when caller is the buyer and `false` otherwise.

## Relationships

- **`src/modules/orders/services/index.ts`** — primary subject under test: `orderService.cancelOnRequestById`, `getById`, `withActions`, `updateById`, `removeById`, `restoreById`.
- **`src/modules/orders/services/cancel.ts`** — imports `cancelForErasureById` (referenced but not exercised in the visible portion).
- **`src/modules/orders/repository.ts`** — `orderRepository.findById` used by `statusOf` to verify post-conditions.
- **`src/modules/orders/events.ts`** — `ORDER_CANCELED` name used to query the outbox for a side-effect-free refusal.
- **`src/kernel/outbox.ts`** — `outboxEventModel.countDocuments` asserts that a refused cancel produces no outbox row.
- **`src/infrastructure/observability/audit.ts`** — fully replaced (not spied) via `jest.mock` → `auditPortMock()`; `observePort(auditPort.emitAuditEvent)` captures the `ownOrder` audit field.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `forceOrderStatus`, `toOrderItem`.
- **`src/modules/products/tests/factories.ts`** — `createProduct`.
- **`src/modules/users/tests/factories.ts`** — `createUser` with a role parameter.
- **`src/types/index.ts`** — `OrderStatus` enum values used in assertions.
- **`tests/support/callers.ts`** — `asRole` (builds a role-tagged caller key) and `callerContextAs` (builds the request context).
- **`tests/support/ports.ts`** — `observePort` (port-swap observation) and `auditPortMock` (the replacement used in `jest.mock`).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory/ephemeral database before all tests.

## Notes

- The audit module is **replaced**, not spied: the mock is `jest.requireActual('@tests/ports').auditPortMock()`, so the real `audit.ts` code never runs. Any assertion on audit output goes through `observePort`.
- `STAFF_ID` is deliberately a *real* ObjectId (passes format validation) but maps to no user — it stands in for "an operator identity that owns nothing."
- A refused cancel is verified as side-effect-free both at the domain level (status unchanged) and at the infrastructure level (zero `ORDER_CANCELED` outbox rows).
- `pay` (card/checkout) belongs to the buyer; `recordPayment` (offline/manual) belongs to the operator. They are mutually exclusive action surfaces, not alternatives for the same actor.
- The file is truncated in the dependency snapshot; the final `it.each` case for the `ownOrder` audit assertion is cut off mid-expression.
- Roles carry no rank: the "no rank on an order" suite explicitly tests that a moderator can cancel an admin's order and an admin can cancel a moderator's, confirming flat key-based access.
