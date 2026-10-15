---
source: src/modules/orders/tests/integration/cancel.test.ts
sha256: 8ca83a5f15d9d561fed0c9b1f8a57e03ca2300f90c0bcc24250effda0952ec0a
generated_at: 2026-10-15T11:13:25.092830+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/cancel.test.ts

## Purpose

Integration test suite for `orderService.cancelById`. It verifies the status-transition gate (pending/shipped/processing/paid), caller-scope enforcement (owner vs. admin vs. system actor vs. moderator), refund semantics carried in the `ORDER_CANCELLED` domain event, and that audit/analytics side-effects fire with the correct caller identity. Each test hits a real database (`setupTestDb`) and exercises the full service → repository → event pipeline.

## Key elements

- **`seedOrder(user)`** – creates a product via `createProduct` and a single-item order via `createOrder`; the standard fixture for every test.
- **`describe('cancelById')`** – core permission and status-gate cases: owner cancels pending (200), stranger gets 404 (indistinguishable from missing), shipped order gets 409 with code `ORDER_NOT_CANCELLABLE`, admin cancels non-owned order, `processing → cancelled` is admin-only, `SYSTEM_ACTOR` cannot cancel a paid order (B21 race), soft-deleted order returns 404.
- **`describe('cancelById — who gets their money back')`** – asserts the `refund` boolean in the `ORDER_CANCELLED` event payload: customer always gets `true`, admin/moderator may pass `false`, default is `true`. Uses `markDomainEventsWired` + `onDomainEvent` to capture the event and `settleOutboxNudges` to flush.
- **`describe('cancelById — audit and analytics')`** – verifies `emitAuditEvent` and `emitAnalyticsEvent` are called with the correct action/event names and caller context.
- **Mailer mock** – `enqueueEmail` is stubbed so the test asserts the queue was hit, not the email body (content is pinned in `mail-copy.test.ts`).
- **Audit / Analytics port mocks** – full `jest.mock` replacements (not `jest.spyOn`) that swap `emitAuditEvent` / `emitAnalyticsEvent` for jest fns while keeping the rest of the module intact.

## Relationships

- **`src/modules/orders/services/index.ts`** – under test; `orderService.cancelById` is the sole subject.
- **`src/modules/orders/repository.ts`** – `orderRepository.findById` / `updateStatusIfIn` / `save` used to seed and assert persisted state.
- **`src/modules/orders/model.ts`** – `orderModel` imported (type/instance for fixtures).
- **`src/modules/orders/events.ts`** – `ORDER_CANCELLED` constant subscribed in refund tests.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem`, `markOrderPaidAt`, `setWithdrawUntil` helpers.
- **`src/modules/products/tests/factories.ts`** – `createProduct` for seeding order items.
- **`src/kernel/events.ts`** – `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` for the outbox/event pipeline.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` to flush pending outbox deliveries.
- **`src/kernel/permissions.ts`** – `SYSTEM_ACTOR` constant for the reservation-sweep test.
- **`src/infrastructure/adapters/mailer.ts`** – `enqueueEmail` mocked.
- **`src/infrastructure/adapters/logger.ts`** – `logger` imported (likely for service-internal logging during the call).
- **`src/infrastructure/observability/audit.ts`** – mocked; `emitAuditEvent` / `recordAudit` replaced.
- **`src/infrastructure/observability/analytics/index.ts`** – mocked; `emitAnalyticsEvent` replaced.
- **`src/modules/orders/audit.ts`** – `ordersAuditActions` used to assert correct audit action name.
- **`src/modules/orders/analytics.ts`** – `ordersAnalyticsEvents` used to assert correct analytics event name.

## Notes

- **Port mocks are full replacements, not spies.** `jest.spyOn` fails on non-configurable getters exposed by CommonJS namespace imports under the `swc` transform and Stryker's sandbox. The mock factory spreads `jest.requireActual` and overrides only the emit function.
- **`recordAudit` re-routing.** The audit mock must also override `recordAudit` because it closes over its own module's real `emitAuditEvent`; the replacement delegates to the mocked `emitAuditEvent` so a spy sees every call.
- **`observePort` (from `@tests/ports`).** The canonical helper for asserting calls on the replaced port fns without re-importing the jest mock.
- **`markDomainEventsWired()` must precede `onDomainEvent`.** Without it the outbox relay is inert and refund assertions silently pass with zero events.
- **Refund is server-side for customers.** Passing `{ refund: false }` as a customer is ignored; the event always carries `refund: true`. Only admin/moderator can suppress it.
