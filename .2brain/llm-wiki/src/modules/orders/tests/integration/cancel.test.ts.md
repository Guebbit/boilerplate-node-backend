---
source: src/modules/orders/tests/integration/cancel.test.ts
sha256: cd3b206a8abdd0fd0f307fd7f6e0717c9be1725faa3b9d6254c330629df09112
generated_at: 2026-10-29T04:52:02.972683+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/cancel.test.ts

## Purpose

Integration test suite for the order-cancellation entry points (`cancelOnRequestById` and `cancelForErasureById`). It verifies the authorization and status-gate invariants that make cancellation safe to expose — ownership scope, per-role cancel permissions, the 404/409 refusal distinction, refund semantics per caller role, and that audit/analytics side-effects fire correctly.

## Key elements

- **`seedOrder(user)`** – local helper that creates a product and a single-item order via the orders test factories.
- **`describe('cancelOnRequestById')`** – core authorization & status-gate cases: owner cancels pending, stranger gets 404, shipped gets 409 with `ORDER_NOT_CANCELLABLE` code, admin cancels a non-owned order, operator (not customer) cancels a `processing` order, system actor (`cancelForErasureById`) refuses a `paid` order (B21 race), soft-deleted order returns 404.
- **`describe('cancelOnRequestById — who gets their money back')`** – refund-semantics tests: customer cancel always emits `refund: true` regardless of the `{ refund: false }` flag; admin and moderator can suppress the refund; the `ORDER_CANCELLED` event is always emitted with the correct `cause`.
- **`describe('cancelOnRequestById — audit and analytics')`** – asserts `emitAuditEvent` and `emitAnalyticsEvent` are called with the correct action constants (`ordersAuditActions.ORDER_CANCELLED`, `ordersAnalyticsEvents.ORDER_CANCELLED`) and actor context.
- **Port mocks** – `mailer.enqueueEmail` is a plain `jest.fn()`; the audit and analytics ports are fully replaced (see Notes).
- **Outbox/event wiring** – refund and event tests call `markDomainEventsWired()` + `onDomainEvent(ORDER_CANCELLED, …)` in `beforeEach`, then `settleOutboxNudges()` to flush; `resetDomainEvents()` in `afterEach`.

## Relationships

- **`src/modules/orders/services/index.ts`** – imports `orderService` (the `cancelOnRequestById` entry point under test).
- **`src/modules/orders/services/cancel.ts`** – imports `cancelForErasureById`, the system-actor cancellation path tested for the B21 race.
- **`src/modules/orders/repository.ts`** – `orderRepository` is used for setup (`updateStatusIfIn`, `save`) and post-assertions (`findById`).
- **`src/modules/orders/model.ts`** – `orderModel` imported (used in setup/seed paths).
- **`src/modules/orders/events.ts`** – `ORDER_CANCELLED` event constant passed to the domain-event subscriber.
- **`src/modules/orders/module.ts`** – `ordersModule` registered via `registerModules` so the outbox relay can deliver events.
- **`src/modules/orders/audit.ts`** – `ordersAuditActions` constants used in audit assertions.
- **`src/modules/orders/analytics.ts`** – `ordersAnalyticsEvents` constants used in analytics assertions.
- **`src/kernel/events.ts`** – `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` for wiring event subscriptions in each test.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushes the outbox so async event delivery completes before assertions.
- **`src/kernel/registry.ts`** – `registerModules` makes module subscriptions active for the outbox relay.
- **`src/infrastructure/adapters/mailer.ts`** – `enqueueEmail` is mocked (replaced with `jest.fn()`) so no real mail is sent.
- **`src/infrastructure/observability/audit.ts`** – replaced wholesale with `auditPortMock()` from `@tests/ports`.
- **`src/infrastructure/observability/analytics/index.ts`** – replaced with a partial mock exposing `emitAnalyticsEvent: jest.fn()`.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem`, `markOrderPaidAt`, `setWithdrawUntil`, `timelineOf` used for seed data.

## Notes

- **Port replacement, not spying.** The audit and analytics ports are swapped via `jest.mock` (not `jest.spyOn`) because CommonJS namespace-import getters are non-configurable under the swc transform, and `jest.spyOn` on them fails inside Stryker's mutation-testing sandbox. The shared helper lives in `@tests/ports`.
- **Refund flag is caller-conditional.** Passing `{ refund: false }` has no effect for the `customer` role (always refunded); it *is* honored for `admin` and `moderator`. This is an intentional policy invariant pinned by tests.
- **Event is always emitted.** Even a no-refund operator cancel still fires `ORDER_CANCELLED`; the test explicitly asserts this to prevent future code from suppressing the event based on the refund flag.
- **System actor has a narrower transition edge.** `cancelForErasureById` can only walk `pending → cancelled`, unlike `admin` which can also walk `processing → cancelled`. The B21 race test relies on this asymmetry.
- **File is truncated in the source snapshot**; additional audit/analytics cases (e.g., refusal paths, admin-cancel variants) likely follow the visible portion.
