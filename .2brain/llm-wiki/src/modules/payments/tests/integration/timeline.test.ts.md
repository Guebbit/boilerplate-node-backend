---
source: src/modules/payments/tests/integration/timeline.test.ts
sha256: 667da893f426ed4548554ba94ffd87994094b2db6d50f746fabce7fd08f9df5d
generated_at: 2026-11-08T07:38:40.928819+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/timeline.test.ts

## Purpose

Integration test (real Mongo) that verifies which events the payments module writes onto an order's timeline and what data those events carry. Covers the `paid` row, a single `payment_declined` row, and the three refund moments (`refund_issued`, `refund_settled`, `refund_failed`), asserting ids, amounts, closed failure codes, actor attribution, and role-based visibility.

## Key elements

- **`paidOrder()`** (local helper) — Creates a user, a 50.00 product, a 2-unit order, a payment intent, and confirms with a card token. Returns `{ user, orderId }` for subsequent assertions.
- **`refund(orderId, amount)`** (local helper) — Delegates to `refundOrderPayment` factory as admin `admin-1`.
- **`describe('the payment')`** — Three specs: card payment writes `paid` with `method: 'card'` and no actor; offline cash payment names the cashier and method; `recordDecline` is idempotent (second call returns `null`, timeline has exactly one row).
- **`describe('a refund')`** — Four specs:
  - Issue + settlement carry the operator, amount, currency, reason code, and a shared `refundId`.
  - A provider failure writes `refund_failed` with a closed code (`insufficient_funds`) and **never** the provider's raw wording.
  - Retry sweep: repeated same-reason failures do not add rows; a new reason adds one; the repository's `attempts` counter keeps incrementing (reaches 4 after 4 failures).
  - Role visibility: buyer sees `paid` + `refund_issued` only; admin sees all three including `refund_failed`.

## Relationships

- **`@modules/payments/services/index.ts`** — `paymentService` is the primary actor under test (`createIntent`, `confirmPayment`, `recordOfflinePayment`, `retryOpenRefunds`).
- **`@modules/payments/services/announce.ts`** — `recordDecline` is called directly to exercise the decline path.
- **`@modules/payments/repository.ts`** — `paymentRepository.findByOrderId` is read to assert the internal `attempts` counter.
- **`@modules/payments/providers/index.ts` / `providers/errors.ts`** — `PaymentProviderError` is thrown by the fake provider to simulate closed-code failures.
- **`scenarios/support/doubles/payments/fake.ts`** — `fakePaymentProvider.refund` is spied on and mocked to reject with specific errors.
- **`@modules/payments/module.ts`** — Registered in `beforeEach` via `registerCheckoutModules`.
- **`@modules/orders/index.ts`** — `orderService.create` and `orderService.readTimeline` are used to build preconditions and assert role-filtered output.
- **`@modules/orders/tests/factories.ts`** — Provides `createOrder`, `toOrderItem`, `timelineOf`.
- **`@modules/users/tests/factories.ts` / `@modules/products/tests/factories.ts`** — `createUser`, `createProduct` for fixture setup.
- **`@modules/payments/tests/factories.ts`** — `refundOrderPayment` wraps the refund call with caller context.
- **`@kernel/events.ts`** — `resetDomainEvents` in `afterEach` to avoid cross-test leakage.
- **`@tests/callers.ts`** — `asCustomer`, `asAdmin`, `testCallerContext`, `callerContextAs` build the caller identities.

## Notes

- Runs against a **real** Mongo instance (`setupTestDb()`); no in-memory DB.
- The "never the provider's wording" assertion is done by serializing the entire timeline with `JSON.stringify` and checking the raw text is absent — a deliberate guard against leaking free-text into persisted rows.
- The `refundId` shared-across-variants check requires a `'refundId' in data` type narrowing because the timeline `data` field is a discriminated union.
- `NODE_PAYMENT_REFUND_RETRY_MINUTES` is overridden to `'0'` via `withEnvironmentOverrides` so the sweep can pick up failures immediately without waiting.
- Idempotency of `recordDecline` is part of the contract: the second call returns `null` rather than a new timeline row.
