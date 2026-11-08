---
source: src/modules/returns/tests/integration/service.test.ts
sha256: 600719f158f7d5b480899cc7352c442b67eb0038e3a37b1649c6dd7978692fa2
generated_at: 2026-11-08T08:11:21.172049+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/service.test.ts

## Purpose

Integration tests for the returns service (`returnService`) executed against a real database. They verify conditional-write guarantees (a withdrawal actually cancels the order and refunds the payment; a return on shipped goods actually writes lines and quantities) and scoping invariants (tenant isolation, customer ownership, role-based access). The only external effects mocked are the mail queue and the audit port; every domain event, outbox relay, and database write runs for real.

## Key elements

- **`orderIn(status)`** – Fixture builder: creates a unique customer, two products, and an order in the given `OrderStatus`. If the status is `shipped` or `delivered`, it calls `carryOrderTo` to produce real shipment rows, settles the outbox, and clears the mail mock so later assertions are clean.
- **`buyer(user)`** – Wraps a user record into a customer caller context via `asCustomer`.
- **`deliveredOrder()`** – Shorthand for a delivered order still inside a 7-day withdrawal window.
- **`orderWithExcluded(carriedTo?)`** – Order containing one withdrawable item and one `noWithdrawal` (Art. 16) item.
- **`onlyExcludedOrder()`** – Paid order composed solely of a `noWithdrawal` item.
- **`describe('a withdrawal before dispatch')`** – Parameterised across `pending`, `paid`, `processing`; asserts order cancellation, single closed-at-birth return record, refund amount (0 for unpaid, full for paid), domain-event sequence (`RETURN_REQUESTED` → `RETURN_CLOSED`), idempotency (second call → `RETURN_ORDER_NOT_RETURNABLE`), tenant/role scoping, and input validation (422 on missing `requestedAt`).
- **`describe('goods excluded from the right of withdrawal (Art. 16)')`** – Verifies that `noWithdrawal` items are handled per Art. 16 (content truncated; section present).
- **Mocks** – `enqueueEmail` (mailer) and `emitAuditEvent` (audit port) are the sole jest mocks; all other infrastructure runs for real.

## Relationships

- **`src/modules/returns/module.ts`** – Imported as `returnsModule` and registered via `registerCheckoutModules` in `beforeEach` so the service's repository and event wiring is available.
- **`src/modules/payments/module.ts`** – Imported as `paymentsModule` and registered alongside `returnsModule`; withdrawal tests depend on the real refund path.
- **`src/modules/returns/events.ts`** – `RETURN_REQUESTED` and `RETURN_CLOSED` are subscribed via `onDomainEvent` to assert the outbox-delivered event sequence.
- **`src/modules/returns/audit.ts`** – `returnsAuditActions` imported (used to verify audit action codes in assertions).
- **`src/kernel/events.ts`** – `resetDomainEvent` clears subscriptions in `afterEach`; `onDomainEvent` registers per-test listeners.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushes the outbox so events land before assertions.
- **`src/kernel/access/tenant.ts`** – `DEPLOYMENT_TENANT_ID` provides the tenant scoping context for `setEnvironment`.
- **`src/infrastructure/adapters/mailer.ts`** – Fully mocked; `enqueueEmail` is asserted for call count and template name (`returns.notice`).
- **`src/infrastructure/observability/audit.ts`** – Replaced with `auditPortMock()`; `emitAuditEvent` is the assertion target.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `readOrder`, `setConformityUntil`, `setWithdrawUntil`, `toOrderItem`, `markOrderPaidAt` build and inspect order fixtures.
- **`src/modules/delivery/tests/factories.ts`** – `carryOrderTo` advances an order to `shipped`/`delivered` through the real delivery path.
- **`src/modules/products/tests/factories.ts`** – `createProduct` with optional `noWithdrawal` flag.
- **`src/modules/access/tests/factories.ts`** – `seedMembership` grants role/permission rows needed for staff-role tests.
- **`src/modules/orders/index.ts`** – `orderService` imported for cross-module assertions (e.g., reading order status after a return).

## Notes

- The audit port is **replaced** (`jest.mock` with `auditPortMock()`), not spied on, because `recordAudit` closes over its own module-level `emitAuditEvent` binding; a plain `jest.spyOn` would not intercept it.
- `setupTestDb()` runs once at module level, not per test.
- `registerCheckoutModules([paymentsModule, returnsModule])` is called in every `beforeEach`; without it the returns service's DI container would be unpopulated.
- A module-level `customers` counter guarantees unique emails because the users collection enforces one row per email; resetting it between test suites is unnecessary (it only increments).
- After shipping fixtures (`carryOrderTo`), the test calls `settleOutboxNudges()` and then `mockEnqueueEmail.mockClear()` so that setup emails do not pollute assertions about return-triggered mail.
