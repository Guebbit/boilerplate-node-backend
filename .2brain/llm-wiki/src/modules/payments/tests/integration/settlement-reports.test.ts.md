---
source: src/modules/payments/tests/integration/settlement-reports.test.ts
sha256: ff3fd81558661ee6520260440a53ddede2313b76abbd33cddebae220eb2c0430
generated_at: 2026-10-29T05:22:00.623927+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/settlement-reports.test.ts

## Purpose

Integration test verifying that settlement side-effects — the `payment.failed` outbox event, the audit row, and the analytics event — fire exactly **once per real state transition**, regardless of how many times the same payment is polled, webhooke'd, or synced. Uses a real Mongo instance.

## Key elements

- **`openIntent()`** — creates a user, a product (10 in stock), an order, and an unconfirmed payment intent; returns the IDs needed for downstream calls.
- **`confirmWith(paymentId, user, method)`** — thin wrapper around `paymentService.confirmPayment` with caller-context boilerplate.
- **`failedRows()`** — settles outbox nudges then counts `PAYMENT_FAILED` documents in the outbox collection.
- **`describe('a declined payment')`** — three tests: webhook-after-confirm produces 1 failure; two sequential declines produce 2; repeated `syncPayment` calls don't duplicate audit/analytics rows.
- **`describe('a payment that already succeeded')`** — repeated `syncPayment` on a confirmed payment still yields exactly 1 audit + 1 analytics record.
- **`describe('a confirm that loses the race')`** — mocks `fakePaymentProvider.confirm` to let a webhook flip the status to `succeeded` mid-flight; asserts the confirm response reflects the new state, not a stale pre-read.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/payments/services/index.ts` | Calls `paymentService.createIntent`, `.confirmPayment`, `.applyWebhookSettlement`, `.syncPayment`. |
| `src/modules/payments/repository.ts` | Reads `findByOrderId` and writes `updateStatusIfIn` (race-condition test). |
| `src/modules/payments/events.ts` | Imports `PAYMENT_FAILED` for outbox queries. |
| `src/modules/payments/audit.ts` | Imports `paymentsAuditActions` to filter audit-spy calls. |
| `src/modules/payments/analytics.ts` | Imports `paymentsAnalyticsEvents` to filter analytics-spy calls. |
| `src/modules/payments/module.ts` | Passed to `registerCheckoutModules` in `beforeEach`. |
| `src/modules/orders/index.ts` | Calls `orderService.create` to build the order under test. |
| `src/kernel/outbox.ts` | Uses `outboxEventModel.countDocuments` and `settleOutboxNudges` to assert outbox contents. |
| `src/kernel/events.ts` | Calls `resetDomainEvents` in `afterEach`. |
| `src/infrastructure/observability/audit.ts` | Fully replaced via `jest.mock` with the shared port mock from `@tests/ports`. |
| `src/infrastructure/observability/analytics/index.ts` | Partially mocked: real module spread, `emitAnalyticsEvent` overridden with `jest.fn()`. |
| `scenarios/support/doubles/payments/fake.ts` | Provides `fakePaymentProvider` whose `confirm` is spied on in the race test. |
| `src/modules/users/tests/factories.ts` | `createUser` factory. |
| `src/modules/products/tests/factories.ts` | `createProduct` factory. |

## Notes

- **Ports are replaced, not spied on.** The audit port is swapped entirely via `jest.mock` pointing at the shared `auditPortMock()` helper; the analytics port is partially mocked so only `emitAnalyticsEvent` is a `jest.fn()`. Use `observePort` from `@tests/ports` to inspect calls rather than reaching into `jest.spyOn` state.
- **Real Mongo.** `setupTestDb()` is called at module level; no in-memory DB. Tests depend on actual document counting in the outbox collection.
- **`failedRows()` must call `settleOutboxNudges()` first.** Without it the outbox relay hasn't written the document and the count will be 0.
- **`beforeEach` registers modules.** The checkout module graph is re-registered every test so cross-module service wiring is fresh; forgetting this causes "service not registered" errors.
