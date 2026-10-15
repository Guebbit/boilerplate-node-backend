---
source: src/modules/returns/tests/integration/service.test.ts
sha256: 462a7b53b3e90dedc90ecfbc6f2c3cb7a723db4c3596acb88ec583cee790b842
generated_at: 2026-10-15T12:00:41.264241+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/service.test.ts

## Purpose

Integration tests for the returns service (`createReturn`, `approveReturn`, `declineReturn`, etc.) run against a real database. The goal is to verify conditional writes and tenant scoping end-to-end: a withdrawal genuinely cancels the order and refunds the payment, a return on shipped goods writes real lines, and concurrent staff decisions race correctly. The only things mocked are the mail queue and the audit event emitter.

## Key elements

- **`orderIn(status)`** — Helper that creates a fresh customer (unique email), two products, and an order at the given `OrderStatus`; if the target is `shipped`/`delivered`, it drives the order there via `carryOrderTo`. Returns a bundle of entities for assertions.
- **`deliveredOrder()`** — Wraps `orderIn(OrderStatus.delivered)` and sets a 7-day `withdrawUntil` window.
- **`orderWithExcluded(carriedTo?)`** — Builds an order containing one `noWithdrawal` product (engraved mug) and one normal product, for Art. 16 exclusion tests.
- **`buyer(user)`** — Shorthand for `asCustomer(user.id)` caller context.
- **"a withdrawal before dispatch" suite** — Verifies order cancellation, refund amounts (0 vs. 70), single email, domain-event ordering via outbox, idempotency guard, 404 for foreign/admin callers, and reason restrictions.
- **"goods excluded from the right of withdrawal (Art. 16)" suite** — Verifies excluded lines are dropped from auto-generated returns and that naming an excluded line yields a 422.
- **`jest.mock('@infrastructure/adapters/mailer')`** — Replaces `enqueueEmail` with a jest.fn; assertions check call count and template name (`'returns.notice'`).
- **`jest.mock('@infrastructure/observability/audit')`** — Full module replacement (not a spy) that intercepts `emitAuditEvent` while keeping `buildAuditEvent` and other exports intact.
- **`registerCheckoutModules([paymentsModule, returnsModule])`** — Called in `beforeEach` so the service can resolve the payment and return repositories.

## Relationships

- **`@kernel/events`** — `onDomainEvent` registers listeners to capture `RETURN_REQUESTED` / `RETURN_CLOSED`; `resetDomainEvents` runs in `afterEach`.
- **`@kernel/outbox`** — `settleOutboxNudges()` flushes the outbox so domain events are dispatched before assertions.
- **`@infrastructure/adapters/mailer`** — The sole external I/O mock; tests assert exact call counts and template identifiers.
- **`@infrastructure/observability/audit`** — Replaced wholesale (see Notes); `mockEmitAuditEvent` is used to assert audit payloads.
- **`@modules/orders/tests/factories`** — Provides `createOrder`, `readOrder`, `toOrderItem`, `markOrderPaidAt`, `setWithdrawUntil`, `forceOrderStatus`.
- **`@modules/delivery/tests/factories`** — `carryOrderTo` advances an order to shipped/delivered through the real delivery pipeline.
- **`@modules/products/tests/factories`** — `createProduct` with optional `noWithdrawal` flag.
- **`@modules/access/index`** — `assignRole` used to grant staff permissions for approve/decline tests.
- **`@modules/payments/module`** — Registered so withdrawal tests can trigger a real refund path.
- **`@modules/returns/events`** — `RETURN_CLOSED`, `RETURN_REQUESTED` constants for event-listener assertions.
- **`@modules/returns/audit`** — `returnsAuditActions` imported for audit-action assertions.
- **`@kernel/access/tenant`** — `DEPLOYMENT_TENANT_ID` used in tenant-scoping setup.

## Notes

- **Audit mock is a replacement, not a spy.** `recordAudit` closes over the audit module's own `emitAuditEvent`, so a `jest.spyOn` on the imported function would not intercept the internal call. The mock re-implements `recordAudit` to route through the injected `emitAuditEvent` fn.
- **Distinct email per customer.** The users collection enforces one row per email, so the `customers` counter ensures a unique address for every `createUser` call.
- **Clear mailer after delivery setup.** `mockEnqueueEmail.mockClear()` is called after `carryOrderTo` so that shipped/delivered notification mails don't pollute the assertion that exactly one return-notice mail was sent.
- **Events ride the outbox.** Domain events are not dispatched synchronously; tests must call `await settleOutboxNudges()` before asserting on `onDomainEvent` listeners.
- **`it.each` over statuses.** The withdrawal-before-dispatch suite parametrises `pending`, `paid`, `processing` to confirm the same invariants hold at every pre-dispatch state.
