---
source: src/modules/returns/tests/integration/service.test.ts
sha256: aea1b56552bb4951f8a9f5d40e3006641c70bf0a58c278fd2577bc4df9e94846
generated_at: 2026-10-29T05:49:34.077355+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/service.test.ts

## Purpose

Integration tests for `returnService` run against a real database. The file verifies the service's conditional writes (order cancellation, refund calculation, line-item scoping) and its tenant/role scoping, without mocking any domain logic. Only the mail queue and the audit emitter are stubbed. It covers withdrawals before dispatch, goods excluded under Art. 16, and concurrent staff decisions.

## Key elements

- **`orderIn(status)`** — helper that creates a fresh customer, two products, and an order at the given `OrderStatus`; if the status is `shipped`/`delivered` it routes through `carryOrderTo` so real shipment rows exist, then clears setup emails.
- **`deliveredOrder()`** — wraps `orderIn(OrderStatus.delivered)` and extends the withdrawal window by 7 days.
- **`orderWithExcluded(carriedTo)`** — creates an order containing one normal item and one `noWithdrawal` item, optionally carried to delivered.
- **`onlyExcludedOrder()`** — creates a paid order whose sole line is an excluded item.
- **`describe('a withdrawal before dispatch')`** — verifies order cancellation, refund amounts (0 vs. full), single email, domain-event ordering via outbox, idempotency, cross-customer 404, missing-staff-permission 404, 422 on missing statement fields, and rejection of non-withdrawal reasons.
- **`describe('goods excluded from the right of withdrawal (Art. 16)')`** — verifies that `noWithdrawal` lines are excluded from refunds and that an order of only excluded lines cannot be withdrawn.
- **Mocks** — `enqueueEmail` (mailer) is jest-mocked to capture calls; `emitAuditEvent` is *replaced* (via `auditPortMock`) because the real `recordAudit` closes over its own module instance and cannot be spied on.

## Relationships

- **`src/modules/returns/module.ts`** — `returnsModule` is imported and registered as a checkout module in `beforeEach`.
- **`src/modules/returns/events.ts`** — `RETURN_REQUESTED` and `RETURN_CLOSED` are used with `onDomainEvent` to assert event ordering.
- **`src/modules/returns/audit.ts`** — `returnsAuditActions` is imported (referenced in audit assertions).
- **`src/kernel/events.ts`** — `resetDomainEvent` and `onDomainEvent` manage the in-memory event bus lifecycle.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` flushes the outbox relay so queued emails and events are delivered before assertions.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` provides the default tenant scope.
- **`src/infrastructure/adapters/mailer.ts`** — fully mocked; tests assert call count and template name (`returns.notice`).
- **`src/infrastructure/observability/audit.ts`** — replaced with `auditPortMock` from `@tests/ports`; tests assert which audit actions fire.
- **`src/modules/orders/tests/factories.ts`** — supplies `createOrder`, `readOrder`, `toOrderItem`, `setWithdrawUntil`, `setConformityUntil`, `markOrderPaidAt`.
- **`src/modules/delivery/tests/factories.ts`** — `carryOrderTo` advances an order to `shipped`/`delivered` through the real delivery path.
- **`src/modules/products/tests/factories.ts`** — `createProduct` (including `noWithdrawal` flag).
- **`src/modules/payments/module.ts`** — registered alongside `returnsModule` so refund side-effects execute.
- **`src/modules/access/tests/factories.ts`** — `seedMembership` provisions staff role/permission rows.
- **`src/modules/orders/index.ts`** — `orderService` is imported (used in cross-module assertions).

## Notes

- **Audit mock is a replacement, not a spy.** The comment in the file explains that `recordAudit` closes over its own module-level `emitAuditEvent`, so a plain `jest.spyOn` would not intercept it. The mock is swapped via `jest.requireActual('@tests/ports').auditPortMock()`.
- **Distinct emails per customer.** A module-level `customers` counter ensures every `createUser` call gets a unique email, because the users collection enforces one row per email.
- **`settleOutboxNudges()` is required before asserting side-effects.** Both emails and domain events ride the outbox relay; calling it without flushing yields no observable calls.
- **Setup emails are cleared after `carryOrderTo`.** The shipping/delivery confirmation emails belong to fixture setup, not to the behaviour under test, so `mockEnqueueEmail.mockClear()` runs immediately after.
- **The file is truncated** (the Art. 16 describe block continues beyond the visible portion), so additional test cases around partial exclusions and concurrent staff decisions are present but not fully shown here.
