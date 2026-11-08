---
source: src/modules/payments/tests/integration/settlement-reports.test.ts
sha256: ff3fd81558661ee6520260440a53ddede2313b76abbd33cddebae220eb2c0430
generated_at: 2026-11-08T07:38:03.622542+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/settlement-reports.test.ts

## Purpose

Integration test verifying that settlement "reports"—a `payment.failed` outbox event, an audit row, and an analytics event—fire exactly once per real payment transition, regardless of how many times the same transition is observed (webhook replay, repeated polling, sync of an already-final payment). Uses a real MongoDB instance.

## Key elements

- **`openIntent()`** — Helper that creates a user, product, order, and an unconfirmed payment intent; returns `{ user, orderId, paymentId }` for use across tests.
- **`confirmWith(paymentId, user, method)`** — Thin wrapper around `paymentService.confirmPayment` with the caller context already bound.
- **`failedRows()`** — Settles outbox nudges, then counts outbox documents named `PAYMENT_FAILED`; the primary assertion target for "announced once" guarantees.
- **`describe('a declined payment')`** — Three cases: confirm + webhook for the same attempt → 1 row; two distinct card declines → 2 rows; confirm + repeated `syncPayment` polls → 1 audit + 1 analytics call.
- **`describe('a payment that already succeeded')`** — Confirms with a good card, then syncs twice; asserts exactly one `PAYMENT_CONFIRMED` audit action and one `PAYMENT_SUCCEEDED` analytics event.
- **`describe('a confirm that loses the race')`** — Spies on `fakePaymentProvider.confirm` with `mockImplementationOnce` to simulate the webhook updating status to `succeeded` before the provider's confirm resolves; asserts the confirm response reflects the new state, not the stale pre-read.

## Relationships

- **`src/modules/payments/services/index.ts`** — Primary subject under test (`createIntent`, `confirmPayment`, `applyWebhookSettlement`, `syncPayment`).
- **`src/modules/payments/repository.ts`** — Used to look up the payment (for `providerRef`) and to simulate the webhook-wins-race transition.
- **`src/modules/payments/events.ts`** — `PAYMENT_FAILED` constant identifies the outbox row to count.
- **`src/modules/payments/audit.ts`** — `paymentsAuditActions` enum values used to filter captured audit calls.
- **`src/modules/payments/analytics.ts`** — `paymentsAnalyticsEvents` enum values used to filter captured analytics calls.
- **`src/modules/payments/module.ts`** — Registered via `registerCheckoutModules` in `beforeEach`.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` + `outboxEventModel` drive the "how many failure events persisted" assertions.
- **`src/kernel/events.ts`** — `resetDomainEvents()` clears the domain-event bus between tests.
- **`src/modules/orders/index.ts`** — `orderService.create` builds the order that the payment intent attaches to.
- **`src/modules/users/tests/factories.ts`** / **`src/modules/products/tests/factories.ts`** — Seed data factories for each test.
- **`scenarios/support/doubles/payments/fake.ts`** — `fakePaymentProvider` acts as the external payment gateway; spied on in the race-condition test.
- **`src/infrastructure/observability/audit.ts`** — Mocked at module level; `emitAuditEvent` observed via `observePort`.
- **`src/infrastructure/observability/analytics/index.ts`** — Mocked at module level; `emitAnalyticsEvent` replaced with a `jest.fn()`.

## Notes

- Ports are **replaced**, not spied on: `jest.mock` re-points the module to a factory in `@tests/ports` so that the real transport is never exercised. See `tests/support/ports.ts` for the rationale.
- The file relies on real MongoDB (`setupTestDb`); it is not a unit test and cannot run without a reachable Mongo instance.
- The race-condition test mutates `fakePaymentProvider.confirm` via `mockImplementationOnce` and then restores it with `jest.restoreAllMocks()` in `afterEach`; if new tests are added to that block, ensure the spy is scoped to the single call you intend.
- `failedRows()` always calls `settleOutboxNudges()` first; forgetting this step will under-count rows because the relay hasn't flushed.
