---
source: src/modules/returns/tests/integration/service.test.ts
source_sha256: abe5fb2e700adc5ce3804b65f6220395355b4d0d2fe14203158e3c659038ca30
context_sha256: ce6bde9fc94560b010c86e42054e75ba887f3b3b304d1a23388ac3ec18525cbe
generated_at: 2026-11-22T07:37:32.415320+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/integration/service.test.ts

## Purpose
Integration tests for the returns service (`returnService`) running against a real test database. Only the mail queue and the audit port are mocked. The tests check the conditional writes and scoping: a withdrawal before dispatch cancels the order and refunds the payment, a return on shipped goods writes lines and quantities, and two staff deciding the same request race.

## Key elements
- **Mocks**: `@infrastructure/adapters/mailer` is replaced with a `jest.fn()` `enqueueEmail` (`mockEnqueueEmail`). `@infrastructure/observability/audit` is replaced wholesale with `auditPortMock()` from `@tests/ports` (`mockEmitAuditEvent`). The audit module is replaced rather than spied on because `recordAudit` closes over its own module's `emitAuditEvent`.
- **Setup**: `setupTestDb()`. `beforeEach` calls `registerCheckoutModules([paymentsModule, returnsModule])` and clears the mocks. `afterEach` calls `resetDomainEvents()` and `jest.restoreAllMocks()`.
- **`orderIn(status)`**: creates a customer with a unique email, Shirt (30.00 × 2) and Mug (10.00 × 1) products, and an order. For `shipped` or `delivered`, it builds the order as `processing`, then moves it through `carryOrderTo` so real shipments exist. It then runs `settleOutboxNudges()` and clears the mail mock so setup mails don't count.
- **`buyer(user)`**: returns `asCustomer(user.id)`.
- **`deliveredOrder()`**: a delivered order with `setWithdrawUntil` set 7 days ahead.
- **`orderWithExcluded(carriedTo)`**: a Shirt plus an Engraved mug flagged `noWithdrawal: true`, optionally carried to `delivered`, with a withdrawal window set.
- **`onlyExcludedOrder()`**: a paid order made only of the excluded engraved mug, nothing shipped.
- **`describe('a withdrawal before dispatch')`** covers `createReturn` with `reason: 'withdrawal'`:
  - On `pending`, `paid` and `processing` orders it cancels the order and writes a return that is already `closed` with empty `lines`, `decidedAt` and `closedAt` set, and one `returns.notice` mail.
  - The refund is `'0.00'` for an unpaid order and `'70.00'` for a paid one.
  - `RETURN_REQUESTED` and `RETURN_CLOSED` events are each emitted once, after the outbox settles.
  - The order's `returnStatus` stays `'none'`.
  - A second attempt fails with `RETURN_ORDER_NOT_RETURNABLE`.
  - Another customer or a `warehouse` role gets 404.
  - Admin without the stated date and channel gets 422 `RETURN_STATEMENT_INVALID` on `requestedAt`.
  - A non-withdrawal reason such as `'defective'` before dispatch is refused with `RETURN_ORDER_NOT_RETURNABLE`.

## Relationships
- Builds fixtures with factories from `orders`, `products`, `users`, `delivery` (`carryOrderTo`, `fulfillmentOrdersOf`, `shipmentsOf`) and `access` (`seedMembership`), and uses `DEPLOYMENT_TENANT_ID` from `kernel/access/tenant`.
- Uses `@kernel/events` (`onDomainEvent`, `resetDomainEvents`) and `@kernel/outbox` (`settleOutboxNudges`) to observe events that travel through the outbox.
- Imports `deliveryService` from `@modules/delivery` and `orderService` from `@modules/orders`, and registers `paymentsModule` and `returnsModule` as checkout modules.
- Exercises the returns module's own `returnService`, `returnRepository`, `collectPersonalData`, `RETURN_REQUESTED`/`RETURN_CLOSED` and `returnsAuditActions` (from `../../audit`).
- Mocks the mailer and the audit port so the tests can assert on enqueued mail and emitted audit events.

## Notes
- Event and mail assertions need `await settleOutboxNudges()` first, because events are delivered by the outbox relay.
- Customer emails come from a module-level counter, since the users collection keeps one row per email.
- Fixtures for shipped or delivered orders go through the real delivery paths, not direct status writes.
- Some imports (`asReject`, `asStub`, `callerContextAs`, `setEnvironment`, `withEnvironmentOverrides`, `setConformityUntil`) are not used in the visible portion. Later tests in the file presumably use them.
