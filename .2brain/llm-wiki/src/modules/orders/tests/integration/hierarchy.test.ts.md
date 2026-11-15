---
source: src/modules/orders/tests/integration/hierarchy.test.ts
sha256: 56b8589e2eefc448de3e344b82d1585c71512ea5e02e1a9e8eeb4e166d1565dc
generated_at: 2026-11-14T20:51:28.702105+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/hierarchy.test.ts

## Purpose

Integration test for the order access-control hierarchy: verifies that a read key (`display:Order`) never grants a write (cancel), that a customer cancels only their own order, that any operator holding a write key handles every buyer's order regardless of the buyer's role, and that the client-facing action menu reflects these rules. Driven through `orderService` against a real test database.

## Key elements

- **`STAFF_ID`** – A valid ObjectId with no account; used as the generic "operator" caller identity.
- **`orderOf(role, status?)`** – Creates a buyer, a product, and a pending (or specified-status) order for test setup.
- **`statusOf(id)`** – Reads the stored `status` of an order to assert a refusal left it unchanged.
- **`actionsFor(orderId, role, callerId)`** – Calls `orderService.getById` → `withActions` and returns the six boolean action flags (`cancel`, `pay`, `recordPayment`, `process`, `overrideStatus`).
- **`describe('cancelOnRequestById — the write's own scope')`** – Table-driven tests: warehouse/support get 404 on any buyer's order; customer cancels own; moderator/manager/admin cancel any.
- **`describe('what an order offers each caller — what a client renders')`** – Asserts the action menu: buyers see `cancel`+`pay`, read-only roles see neither, operators see `cancel`/`process`/`recordPayment` on both customer and staff orders, and `recordPayment` is withheld once paid or without the key.
- **`describe('no rank on an order')`** – Confirms no caller-vs-buyer hierarchy: every operator role succeeds on every buyer role; operators can update/delete/restore any order; admin handles own order; audit row carries `ownOrder` flag only when caller is the buyer.
- **`jest.mock('@infrastructure/observability/audit', …)`** – Replaces (not spies on) the audit port with `auditPortMock()`.

## Relationships

- **`src/modules/orders/services/index.ts`** – Provides `orderService`, the system under test for every assertion.
- **`src/modules/orders/services/cancel.ts`** – `cancelForErasureById` is imported for erasure-path coverage in the full file.
- **`src/modules/orders/repository.ts`** – Used by `statusOf` to read the persisted order status after a refused cancel.
- **`src/modules/orders/events.ts`** – Exports `ORDER_CANCELED`, used to query the outbox for a refund event.
- **`src/kernel/outbox.ts`** – The outbox collection is queried to verify no refund event row was written after a refused cancel.
- **`src/infrastructure/observability/audit.ts`** – Replaced via `jest.mock`; the audit port's calls are captured to assert the `ownOrder` flag.
- **`tests/support/ports.ts`** – Provides `observePort` and the `auditPortMock` factory used by the mock.
- **`tests/support/callers.ts`** – `asRole` and `callerContextAs` build the caller identity passed to service methods.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` initialises the test database before each suite.
- **`src/modules/users/tests/factories.ts`** – `createUser` for buyer and operator accounts.
- **`src/modules/products/tests/factories.ts`** – `createProduct` for order line items.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `forceOrderStatus`, `toOrderItem` for order fixtures.
- **`src/types/index.ts`** – `OrderStatus` enum values used in assertions and setup.

## Notes

- The audit port is **replaced**, not spied on (explicit comment in the file). Use `observePort` from `tests/support/ports.ts` to inspect audit calls; do not rely on `jest.spyOn` here.
- `STAFF_ID` is deliberately a *valid* ObjectId that matches no account, so role-based checks exercise the key path without an ownership short-circuit.
- The test docblock states the design rule: a role is "only a bundle of keys" — there is no rank or seniority check between caller and buyer.
- `cancelForErasureById` is imported but the visible tests exercise `orderService.cancelOnRequestById`; the erasure path may appear in the truncated remainder.
