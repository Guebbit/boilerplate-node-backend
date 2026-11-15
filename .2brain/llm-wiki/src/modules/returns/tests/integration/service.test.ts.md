---
source: src/modules/returns/tests/integration/service.test.ts
sha256: e99e859e184074b309dd8eb4233771ddd1a8e410154c8000493fc6dc584af685
generated_at: 2026-11-14T21:47:35.414996+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/service.test.ts

## Purpose

Integration test suite for the returns service (`returnService`) run against a real database. It verifies the service's conditional writes, tenant scoping, refund calculations, domain-event emission, and access-control rules for both pre-dispatch withdrawals and post-delivery returns. The only external dependencies mocked are the mailer (`enqueueEmail`) and the audit port (`emitAuditEvent`); order fulfillment, payment settlement, and outbox delivery all execute for real.

## Key elements

- **`setupTestDb()`** — initialises the shared test database once per run.
- **`beforeEach` / `afterEach`** — registers `paymentsModule` and `returnsModule` via `registerCheckoutModules`, clears mail/audit mocks, resets domain-event subscribers, and restores spies.
- **`orderIn(status)`** — helper that creates a customer, two products (shirt + mug), an order in the given status, and—if the status is `shipped`/`delivered`—pushes it through the real delivery pipeline via `carryOrderTo` before clearing setup-time mail calls.
- **`deliveredOrder()`** — wraps `orderIn(delivered)` and extends the withdrawal window by 7 days.
- **`orderWithExcluded(carriedTo?)`** — builds an order containing one withdrawable shirt and one `noWithdrawal` engraved mug, optionally carried to delivered.
- **`onlyExcludedOrder()`** — builds a paid order whose sole item is excluded from withdrawal.
- **`buyer(user)` / `asAdmin()` / `asRole('warehouse')`** — caller-context constructors for tenant-scoped access checks.
- **`describe('a withdrawal before dispatch')`** — table-driven tests over `pending`, `paid`, `processing` covering: order cancellation, single closed return record, refund amount (0.00 unpaid vs 70.00 paid), `RETURN_REQUESTED` + `RETURN_CLOSED` event order via outbox, idempotency (second call → `RETURN_ORDER_NOT_RETURNABLE`), cross-customer 404, insufficient-role 404, missing `requestedAt` 422, and rejection of non-withdrawal reasons pre-dispatch.
- **Additional `describe` blocks** (truncated in source) cover post-delivery return creation, concurrent staff decisions, and personal-data collection (`collectPersonalData`).

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is the sole mocked I/O; assertions verify call count and that setup-time delivery mails are cleared before test-body assertions.
- **`src/infrastructure/observability/audit.ts`** — the audit port is replaced wholesale with `auditPortMock()` from `@tests/ports` because `recordAudit` closes over its own module reference; `returnsAuditActions` is imported from `src/modules/returns/audit.ts` for assertion context.
- **`src/modules/returns/audit.ts`** — provides `returnsAuditActions` used to identify expected audit action codes in assertions.
- **`src/kernel/events.ts`** — `onDomainEvent` subscribes to `RETURN_REQUESTED` / `RETURN_CLOSED`; `resetDomainEvents` cleans up after each test.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` flushes the transactional outbox so event-driven side effects (mail, event listeners) are observable before assertions.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` supplies the fixed tenant for the test environment.
- **`src/modules/orders/tests/factories.ts`** — provides `createOrder`, `readOrder`, `toOrderItem`, `markOrderPaidAt`, `setWithdrawUntil`, `setConformityUntil`.
- **`src/modules/orders/index.ts`** — `orderService` is imported for direct order-state assertions.
- **`src/modules/orders/services/index.ts`** — order service layer used in post-dispatch return flows.
- **`src/modules/delivery/tests/factories.ts`** — `carryOrderTo`, `fulfillmentOrdersOf`, `shipmentsOf` advance orders through real fulfillment.
- **`src/modules/delivery/index.ts`** — `deliveryService` is imported for shipped/delivered state transitions.
- **`src/modules/delivery/services/index.ts`** — delivery service layer exercised when orders are carried to `shipped`/`delivered`.
- **`src/modules/payments/module.ts`** — registered alongside returns so the payment-settlement path executes for real.
- **`src/modules/products/tests/factories.ts`** — `createProduct` with optional `noWithdrawal` flag.
- **`src/modules/access/tests/factories.ts`** — `seedMembership` grants roles to test users.

## Notes

- The audit mock is a **module replacement** (`jest.mock` + `requireActual` of `@tests/ports`), not a spy, because `recordAudit` captures `emitAuditEvent` from its own module scope at import time—`jest.spyOn` would not intercept it.
- `mockEnqueueEmail.mockClear()` is called *after* `settleOutboxNudges()` inside `orderIn` to discard setup-time delivery mails so assertions in test bodies only see the mails the return action triggered.
- Each customer gets a unique email (`customer-${n}@example.com`) because the users collection enforces one row per email.
- `it.each` is used for the status matrix; the test name interpolates the status via `%s`.
- The file asserts on **stored state** (via `returnRepository.findByOrderId`, `readOrder`) rather than return-object shape, keeping tests coupled to the persistence contract rather than the API DTO.
