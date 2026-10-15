---
source: src/modules/payments/tests/integration/timeline.test.ts
sha256: 776cc00a15fb07ea368cddf903db772c19191d941174c924b13127453f94d64f
generated_at: 2026-10-15T11:37:43.382847+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/timeline.test.ts

## Purpose
Integration tests that verify the timeline rows payment operations write onto an order: a `paid` entry, a `payment_declined` entry, and the three refund moments (`refund_issued`, `refund_settled`, `refund_failed`). They run against a real Mongo instance and exercise the payment services through their public API, asserting that rows carry structured codes (never raw provider text) and that visibility differs between buyer and staff.

## Key elements
- **`paidOrder()`** — helper that creates a user, a product (50 × 2 units), an order, a payment intent, and confirms a card payment; returns `{ user, orderId }`.
- **`refund(orderId, amount)`** — one-liner that calls `refundByOrder` as the operator `admin-1`.
- **`describe('the payment')`** — three tests: card payment writes `paid` with method and no actor; offline (cash) payment writes `paid` with the recording operator as actor; `recordDecline` is idempotent (second call returns `null`) and the timeline holds exactly one decline row with a `paymentId`.
- **`describe('a refund')`** — three tests: a successful refund produces `refund_issued` (with amount, currency, reason code, actor) and `refund_settled` sharing the same `refundId`; a provider failure produces `refund_failed` with a closed `failureReason` code and never the provider's raw message; a failed refund is invisible to the buyer but visible to staff via `orderService.readTimeline`.

## Relationships
- **`scenarios/support/doubles/payments/fake.ts`** — `fakePaymentProvider` is spied on (`jest.spyOn`) to force `refund` rejections in failure tests.
- **`src/kernel/events.ts`** — `resetDomainEvents()` called in `afterEach` to clear queued domain events.
- **`src/modules/orders/index.ts`** — `orderService` used to create orders (admin flow) and to call `readTimeline` for buyer-vs-staff visibility assertions.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`, and `timelineOf` provide the test fixtures and the assertion helper for reading timeline rows.
- **`src/modules/payments/module.ts`** — `paymentsModule` registered in `beforeEach` via `registerCheckoutModules` to wire the DI container.
- **`src/modules/payments/providers/index.ts`** — re-exports `PaymentProviderError` (used to construct the mocked failure) and `fakePaymentProvider`.
- **`src/modules/payments/services/announce.ts`** — `recordDecline` is the public entry point tested in the decline scenarios.
- **`src/modules/payments/services/index.ts`** — `createIntent`, `confirmPayment`, `recordOfflinePayment`, and `refundByOrder` are the service methods under test.
- **`src/modules/products/tests/factories.ts`** — `createProduct` creates the priced product fixture.

## Notes
- The suite asserts a hard invariant: timeline rows must contain only closed enum-like codes (`'insufficient_funds'`, `'goodwill'`, `'card'`, `'cash'`) and must **never** leak free-text provider messages. One test explicitly checks `JSON.stringify(rows)` does not contain the raw string.
- Decline is written at most once; a duplicate `recordDecline` call returns `null` rather than creating a second row.
- Failed refunds are visible only to staff (`asAdmin()`); the buyer's timeline shows `refund_issued` but not `refund_failed`.
- `setupTestDb()` (from `@tests/setup-test-db`) provisions a real Mongo — these are true integration tests, not unit tests with a mocked repository.
