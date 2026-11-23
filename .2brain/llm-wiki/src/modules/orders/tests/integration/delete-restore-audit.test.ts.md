---
source: src/modules/orders/tests/integration/delete-restore-audit.test.ts
source_sha256: 7656d0a42b3699c2a5104e25477bcad283d05bccdef3e0f000a9bbfe060a8c05
context_sha256: 9c3dbad91871b09375cb111cf6e657d711c56abba122d787ab336feaacbd2d90
generated_at: 2026-11-22T06:27:10.502648+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/delete-restore-audit.test.ts

## Purpose
Integration tests verifying that `orderService.removeById` and `orderService.restoreById` emit the correct audit events (`ORDER_DELETED` and `ORDER_RESTORED`) with the expected fields. The audit rows are written by the service itself, matching the write path used by other modules.

## Key elements
- `jest.mock('@infrastructure/observability/audit', ...)`: replaces the whole audit port with `auditPortMock()` from `@tests/ports`, rather than spying on it.
- `setupTestDb()`: sets up the test database for the suite.
- `afterEach(() => jest.restoreAllMocks())`: resets mocks between tests.
- `describe('removeById')`:
  - Soft delete (`hardDelete=false`): expects `ORDER_DELETED` with `metadata: { hardDelete: false }`.
  - Hard delete (`hardDelete=true`): expects `ORDER_DELETED` with `metadata: { hardDelete: true }`.
  - Both run as an `admin` caller and assert `outcome: 'success'`, `targetType: 'order'` and `targetId` equal to the order id.
- `describe('restoreById')`: soft-deletes a canceled order, restores it as `admin`, and expects `ORDER_RESTORED` with `outcome: 'success'`, `targetType: 'order'` and the matching `targetId`.

## Relationships
- `src/infrastructure/observability/audit.ts`: its `emitAuditEvent` is the mocked port that the tests observe.
- `src/modules/orders/audit.ts`: provides `ordersAuditActions` (`ORDER_DELETED`, `ORDER_RESTORED`) used in the assertions.
- `src/modules/orders/services/index.ts`: provides `orderService`, the code under test.
- `src/modules/orders/tests/factories.ts`: `seedOrder` creates the fixture orders, seeded in the canceled status.
- `src/types/index.ts`: provides the `OrderStatus` enum used when seeding orders.
- `tests/support/ports.ts`: provides `auditPortMock()` and `observePort()`.
- `tests/support/callers.ts`: `callerContextAs('admin')` builds the caller context.
- `tests/support/setup-test-db.ts`: provides `setupTestDb`.

## Notes
- The audit port is replaced, not spied on, because `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import exposes. The reasoning is documented in `create-audit.test.ts` in the same directory.
- In the restore test, the initial `removeById` call is made without a caller context. Only the `restoreById` call passes `callerContextAs('admin')`.
- Assertions use `expect.objectContaining`, so other fields on the audit event are not checked.
