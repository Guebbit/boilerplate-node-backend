---
source: src/modules/orders/tests/integration/cancel.test.ts
sha256: 7da01e78dcc19451344a661430b82baa1cfdcbfc3690f55016af7ebdf66b36ec
generated_at: 2026-11-14T20:49:39.514313+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/cancel.test.ts

## Purpose

Integration tests for the order-cancellation write path (`cancelOnRequestById` and the system-actor `cancelForErasureById`). They verify the authorization matrix (customer / admin / moderator / system actor), status-gate invariants, refund semantics, and that the audit, analytics, mailer, and domain-event side effects fire correctly.

## Key elements

- **`cancelOnRequestById` suite** – covers: owner cancels pending; stranger gets 404; shipped order gets 409 with `ORDER_NOT_CANCELABLE`; admin cancels another user's order; processing→canceled is admin-only; system actor cannot cancel a paid order (B21 race); soft-deleted order returns 404.
- **`cancelOnRequestById — who gets their money back` suite** – asserts refund/cause fields on the `ORDER_CANCELED` payload captured via `onDomainEvent`. Pins that a customer's `refund: false` is overridden to `true`, while admin/moderator may waive the refund.
- **`cancelOnRequestById — audit and analytics` suite** – asserts `emitAuditEvent` and `emitAnalyticsEvent` payloads (action, actor role, outcome) using `observePort`.
- **`seedOrder(user)`** – creates a product + a single-item order for the given user.
- **`asUser(user)`** – shorthand alias for `asCustomer(user.id)`.
- **Mocks** – `enqueueEmail` (mailer), audit port, and analytics port are all replaced at the module level (see Notes).
- **`setupTestDb()`** – in-memory DB bootstrap; `afterEach` restores all mocks.

## Relationships

- **`src/modules/orders/services/cancel.ts`** – source of `cancelForErasureById`, the system-actor entry point exercised in the "B21 race" test.
- **`src/modules/orders/services/index.ts`** – source of the `orderService` export; `cancelOnRequestById` is the primary API under test.
- **`src/modules/orders/events.ts`** – provides the `ORDER_CANCELED` constant used to subscribe in the refund suite.
- **`src/modules/orders/repository.ts`** – `orderRepository.findById` / `updateStatusIfIn` / `save` are called directly to assert post-state and to advance status between test steps.
- **`src/modules/orders/model.ts`** – `orderModel` is imported (used by the repository layer).
- **`src/modules/orders/module.ts`** – `ordersModule` is passed to `registerModules` so the kernel can route events.
- **`src/modules/orders/audit.ts`** – supplies `ordersAuditActions` constants for assertion matching.
- **`src/modules/orders/analytics.ts`** – supplies `ordersAnalyticsEvents` constants for assertion matching.
- **`src/kernel/events.ts`** – `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` manage the in-test event bus.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushes the outbox so async event delivery completes before assertions.
- **`src/kernel/registry.ts`** – `registerModules` wires the orders module into the kernel for the test process.
- **`src/infrastructure/adapters/mailer.ts`** – `enqueueEmail` is mocked; tests assert the cancellation notice is queued.
- **`src/infrastructure/observability/audit.ts`** – replaced with a port-mock factory (see Notes).
- **`src/infrastructure/observability/analytics/index.ts`** – `emitAnalyticsEvent` is replaced with a jest.fn (see Notes).
- **`src/modules/orders/tests/factories.ts`** – provides `createOrder`, `toOrderItem`, `markOrderPaidAt`, `setWithdrawUntil`, `timelineOf`.

## Notes

- **Audit & analytics ports are `jest.mock`-replaced, not `spyOn`-ed.** A CommonJS namespace import exposes a non-configurable getter that `jest.spyOn` cannot redefine; this fails under the SWC transform used by `jest.config.mutation.js` and inside Stryker's sandbox. The `@tests/ports` helper provides the replacement factories.
- **`settleOutboxNudges()` must be awaited after each cancellation** that should produce a domain event; without it the outbox relay has not delivered and the captured `cancellations` array stays empty.
- **`markDomainEventsWired()` is required** before subscribing via `onDomainEvent`; the kernel will not dispatch to listeners in an "unwired" test process.
- **Refund override is intentional test surface:** passing `{ refund: false }` as a customer is silently upgraded to `refund: true`; the test documents that the customer cannot waive their own refund.
- The "B21 race" test guards a specific past bug where the system actor's `pending→canceled` edge was accidentally reachable from `paid`.
