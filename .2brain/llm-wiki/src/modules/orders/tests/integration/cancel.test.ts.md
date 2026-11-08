---
source: src/modules/orders/tests/integration/cancel.test.ts
sha256: d16c4b3f52a7df9cd358c330d4dd79cf949e4a4feb1e61bbbcc0be32cc62f320
generated_at: 2026-11-08T07:03:39.693312+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/cancel.test.ts

## Purpose

Integration tests for the order-cancellation paths (`orderService.cancelOnRequestById` and the system-actor `cancelForErasureById`). They pin the authorization boundaries (customer vs. admin vs. moderator vs. system), the 404/409 refusal contract, the status-gate invariant (no interleaving can cancel a shipped or paid order), refund semantics, and the audit/analytics side effects that must fire on every successful cancel.

## Key elements

- **`seedOrder(user)`** – helper that creates a product and a pending order for the given user.
- **`asUser(user)`** – shorthand for `asCustomer(user.id)`, used in most customer-path tests.
- **`describe('cancelOnRequestById')`** – core authorization & status-gate tests: owner cancel, stranger 404, shipped 409, shop-owner cancel, operator cancels `processing` (customer cannot), system actor cannot cancel a `paid` order (pins B21 race), soft-deleted → 404.
- **`describe('… who gets their money back')`** – refund semantics: customer cancel is always refunded; operator/moderator may waive with `{ refund: false }`; the `ORDER_CANCELED` event is always emitted regardless of refund flag. Uses `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents`, and `settleOutboxNudges`.
- **`describe('… audit and analytics')`** – asserts `emitAuditEvent` and `emitAnalyticsEvent` are called with the correct action/event constants and actor role.
- **Mocks** – `enqueueEmail` (mailer), the audit port, and the analytics port are replaced at module level (see Notes).

## Relationships

- **`src/modules/orders/services/index.ts`** – exports `orderService`, the primary subject under test.
- **`src/modules/orders/services/cancel.ts`** – exports `cancelForErasureById`, the system-actor cancel path tested in the B21 race case.
- **`src/modules/orders/events.ts`** – provides `ORDER_CANCELED`, used to subscribe and assert domain-event payloads.
- **`src/modules/orders/repository.ts`** – `orderRepository` is used to set up non-default statuses and to assert post-condition state.
- **`src/modules/orders/model.ts`** – `orderModel` is imported (used for soft-delete assertion via `order.deletedAt`).
- **`src/modules/orders/module.ts`** – `ordersModule` is registered via `registerModules` so the outbox relay can deliver events.
- **`src/modules/orders/audit.ts`** / **`src/modules/orders/analytics.ts`** – provide `ordersAuditActions` and `ordersAnalyticsEvents` constants used in assertions.
- **`src/kernel/events.ts`** – `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` drive the event-bus lifecycle in refund tests.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushes the outbox so async event delivery is observable; `outboxEventModel` is imported for outbox inspection.
- **`src/kernel/registry.ts`** – `registerModules` ensures module subscriptions are active before tests run.
- **`src/infrastructure/adapters/mailer.ts`** – `enqueueEmail` is mocked to verify the cancellation notification is queued.
- **`src/infrastructure/observability/audit.ts`** / **`src/infrastructure/observability/analytics/index.ts`** – replaced via `jest.mock` so tests can observe port calls without hitting real sinks.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem`, `markOrderPaidAt`, `setWithdrawUntil`, `timelineOf` build the order fixtures.

## Notes

- **Port mocks use `jest.mock`, not `jest.spyOn`.** A CommonJS namespace import exposes a non-configurable getter, so `jest.spyOn` cannot redefine it. This fails under Stryker's sandbox and the `jest.config.mutation.js` swc transform. See `tests/support/ports.ts` for full reasoning.
- **Refund tests require `markDomainEventsWired()` + `settleOutboxNudges()`.** The outbox relay only delivers events in a process whose modules are registered; without both calls the `cancellations` array stays empty.
- **404 vs 409 is a deliberate client-facing contract.** "Not found" (stranger's order, soft-deleted) and "not in a cancelable state" (shipped, paid, processing) return different statuses so a client can distinguish "retry later" from "wrong order."
- **Soft-deleted orders are 404, not 403.** The comment states the principle: "hidden means hidden" — no information leak that the order exists.
- **The moderator refund-waive test pins a historical bug** where holding only the `update:Order` permission (not the scope wildcard) incorrectly forced a refund.
