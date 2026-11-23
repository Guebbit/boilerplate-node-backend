---
source: src/modules/orders/tests/integration/create-audit.test.ts
source_sha256: 2f270cc5b2fa9c38ae9d680ba7ed48867cab7d96566650ed0bf1c3792a8ad012
context_sha256: 1470624692da46b93eacc36e1fa70a7c83c2d182323b63f3372370927832492d
generated_at: 2026-11-22T06:26:57.538876+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/create-audit.test.ts

## Purpose
Integration test asserting that creating an order writes an `order_created` audit event reflecting the real caller's role name (`actorRoleName`), never a forced or fixed label. This guards against any path, including checkout's own purchases, hardcoding the role to something like "customer".

## Key elements
- `jest.mock('@infrastructure/observability/audit', ...)`: replaces the audit port wholesale with `auditPortMock()` from `@tests/ports` rather than spying on it. The in-file comment defers to `cancel.test.ts` for the reasoning: `jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes.
- `jest.mock('@infrastructure/observability/analytics', ...)`: keeps the real module but stubs `emitAnalyticsEvent` as `jest.fn()`.
- `setupTestDb()`: sets up the test database for the suite.
- `afterEach(() => jest.restoreAllMocks())`: restores mocks after each test.
- `contextAs(role, id = 'test-moderator')`: builds a `CallerContext` with `caller: callerAs(role, id)`, `actorRoleName: role`, and `analyticsConsent: false`.
- Tests (in `describe('create — the audit row records the real caller, never a forced label')`):
  - A moderator-placed order is audited with the orders `ORDER_CREATED` action, `outcome: 'success'` and `actorRoleName: 'moderator'`.
  - An admin-placed order is audited with `actorRoleName: 'admin'`, not silently as a customer.

## Relationships
- `src/infrastructure/observability/audit.ts`: mocked in this file. `observePort` is applied to its `emitAuditEvent` export to get the spy the assertions run against.
- `src/modules/orders/audit.ts`: supplies the `ordersAuditActions` constants, used here for the expected `ORDER_CREATED` action name.
- `src/modules/orders/services/index.ts`: exports `orderService`, whose `create` method is the code under test.
- `src/modules/users/tests/factories.ts`: `createUser()` creates the buyer.
- `src/modules/products/tests/factories.ts`: `createProduct()` creates the product ordered.
- `tests/support/ports.ts`: provides `auditPortMock` and `observePort`.
- `tests/support/callers.ts`: provides `callerAs`.
- `tests/support/setup-test-db.ts`: provides `setupTestDb`.
- `src/types/index.ts` and `src/types/auth-context.ts`: provide the `CallerContext` type, imported from `@types`.

## Notes
- The buyer (the order's user) is distinct from the caller. The audited role comes from the `CallerContext` passed to the order creation call, not from the buyer.
- The default caller id `'test-moderator'` is used even for the admin case.
