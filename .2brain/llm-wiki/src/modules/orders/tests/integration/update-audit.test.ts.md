---
source: src/modules/orders/tests/integration/update-audit.test.ts
source_sha256: 70597af8f0d856c26f99c9a9506bf4d935285c310e1510291f2f7d16ba8e07ff
context_sha256: d28a0948e93b478fb2dd39bff34514ec18a07b81af61a8fd18b55110215e2547
generated_at: 2026-11-22T06:34:51.278804+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/update-audit.test.ts

## Purpose
Integration test for the audit row that `orderService.updateById` writes as `ORDER_UPDATED` after an admin edit. It pins down that the row's metadata names the changed email field (`changedFields: ['email']`) but never includes the email value, since the email is personal data.

## Key elements
- `jest.mock('@infrastructure/observability/audit', ...)`: replaces the audit port module with `auditPortMock()` from `@tests/ports` (the mock is built lazily via `jest.requireActual`).
- `setupTestDb()`: sets up the test database for the suite.
- `afterEach(() => jest.restoreAllMocks())`: restores mocks after each test.
- `updatedMetadata(spy)`: helper that scans the `emitAuditEvent` spy's calls and returns the `metadata` of the first entry whose `action` is `ordersAuditActions.ORDER_UPDATED`.
- Test "names the email when it moved, without its value": creates a user with `buyer@example.com` and an order, then updates the order's email to `other@example.com` as `admin`. Expects metadata to equal `{ changedFields: ['email'] }`.
- Test "writes nothing for the email it already holds": updates the order with its existing email. Expects metadata to equal `{}`.

## Relationships
- `src/infrastructure/observability/audit.ts`: the module whose `emitAuditEvent` is mocked and observed.
- `src/modules/orders/audit.ts`: provides `ordersAuditActions`, whose `ORDER_UPDATED` value is used to find the relevant audit call.
- `src/modules/orders/services/index.ts`: provides `orderService`, whose `updateById` is the code under test.
- `src/modules/orders/tests/factories.ts`: `createOrder` and `toOrderItem` build the order fixture.
- `src/modules/users/tests/factories.ts` and `src/modules/products/tests/factories.ts`: `createUser` and `createProduct` build the related fixtures.
- `tests/support/callers.ts`: `callerContextAs('admin')` supplies the caller context.
- `tests/support/ports.ts`: provides `auditPortMock` and `observePort`.
- `tests/support/setup-test-db.ts`: provides `setupTestDb`.

## Notes
- A source comment says the audit port is replaced rather than spied on; see `tests/support/ports.ts`.
- In the unchanged-email case, `updatedMetadata` returns `{}` (the row's metadata is empty). It does not mean no audit call was made. Had no `ORDER_UPDATED` call been recorded, the helper would return `undefined` and the assertion would fail.
