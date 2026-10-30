---
source: src/modules/orders/tests/integration/hierarchy.test.ts
sha256: d4fce0ef2729d2e43af61b572584c14e6c2a31fcba6b2bcc887ad713229a9055
generated_at: 2026-10-29T04:53:25.682403+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/hierarchy.test.ts

## Purpose

Integration tests that verify the order-cancellation and action-visibility rules driven by the caller's key set (e.g. `display:Order` vs. `update:Order`), ensuring that read-capable roles cannot cancel or pay, that operators can act on any buyer's order regardless of the buyer's role, and that own-order edge cases (self-service, offline payment) behave correctly. The suite exercises the service layer end-to-end against a real test database.

## Key elements

- **`orderOf(role, status?)`** — Creates a buyer with the given role, a product, and a pending (or specified-status) order; returns the order document.
- **`statusOf(id)`** — Reads the persisted `OrderStatus` for an order (asserts a refused cancel left it unchanged).
- **`actionsFor(orderId, role, callerId)`** — Resolves the six action flags (`cancel`, `pay`, `recordPayment`, `process`, `override`) that `orderService.withActions` would expose to a client.
- **`STAFF_ID`** — A valid ObjectId that holds no user account; used as the caller identity for operator-role tests.
- **`describe('cancelOnRequestById — the write's own scope')`** — Verifies that `warehouse`/`support` (read-only key) get 404 on cancel, that no outbox refund event is written on refusal, that a customer can cancel their own order, and that `moderator`/`manager`/`admin` (write key) succeed on any customer's order.
- **`describe('what an order offers each caller')`** — Checks the action flag matrix: buyer gets `cancel`+`pay` on pending; read-only roles get neither; operators get `cancel`/`process` on both customer and staff orders; `recordPayment` is admin-only and hidden once paid; a buyer's own `pay` is always offered.
- **`describe('no rank on an order')`** — Confirms that caller role and buyer role are independent: every operator×buyer combination succeeds on cancel; an operator can update/remove/restore a staff member's order; an admin can handle their own order; audit rows carry `ownOrder: true` only when the caller is the buyer.

## Relationships

- **`src/modules/orders/services/index.ts`** — The system under test; all assertions call `orderService.cancelOnRequestById`, `getById`, `withActions`, `updateById`, `removeById`, `restoreById`.
- **`src/modules/orders/services/cancel.ts`** — Imports `cancelForErasureById` (used internally by the service; present in the import list).
- **`src/modules/orders/repository.ts`** — `orderRepository.findById` is the ground-truth status check after a refused cancel.
- **`src/modules/orders/events.ts`** — `ORDER_CANCELLED` is the outbox event name used to assert no refund was enqueued.
- **`src/kernel/outbox.ts`** — `outboxEventModel.countDocuments` verifies that a refused cancel writes zero outbox rows.
- **`src/infrastructure/observability/audit.ts`** — Fully mocked via `jest.mock` → `auditPortMock()`; in the last test, `observePort(auditPort.emitAuditEvent)` is used to spy the emitted audit payload.
- **`src/modules/orders/tests/factories.ts`** — Provides `createOrder`, `forceOrderStatus`, `toOrderItem` for fixture setup.
- **`src/modules/users/tests/factories.ts`** — `createUser` builds buyer/staff accounts with a given role.
- **`src/modules/products/tests/factories.ts`** — `createProduct` supplies the product referenced in order items.
- **`src/types/index.ts`** — `OrderStatus` enum used for status parameters and assertions.
- **`tests/support/callers.ts`** — `asRole` and `callerContextAs` build the caller identity/context objects passed to service methods.
- **`tests/support/ports.ts`** — Supplies `auditPortMock()` (the jest mock factory) and `observePort` (audit spy helper).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory/test database before all tests.

## Notes

- The audit port is **replaced** (via `jest.mock` + `requireActual` indirection), not spied on, so no real audit writes hit the database. The comment in the file points to `tests/support/ports.ts` for the rationale.
- `STAFF_ID` is intentionally a valid 24-hex ObjectId that matches no `users` row; this keeps role-based tests free of a real account while still passing ObjectId-shaped validation.
- The "no rank" block encodes the project's rule that roles are flat bundles of keys—there is no hierarchy between `admin` and `moderator` once the required key is held; tests assert this explicitly by mixing caller/buyer role pairs.
- A refused cancel is expected to return HTTP 404 (not 403), consistent with the codebase's "do not leak existence" convention.
