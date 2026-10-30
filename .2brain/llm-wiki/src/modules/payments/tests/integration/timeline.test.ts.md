---
source: src/modules/payments/tests/integration/timeline.test.ts
sha256: 9091cc41d97bec20751c6781a85a5252f4e62a21fdd7ace8b2c80dfc0af070f6
generated_at: 2026-10-29T05:22:37.298533+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/timeline.test.ts

## Purpose

Integration tests that verify exactly what the payments module writes onto an order's timeline: the `paid` row (with method and optional actor), a single `payment_declined` row, and the three refund moments (`refund_issued`, `refund_settled`, `refund_failed`). Runs against a real Mongo instance through the services' public API, asserting that rows carry closed codes and structured data — never the provider's raw wording.

## Key elements

- **`paidOrder()`** (local helper) — Creates a user, a product (50.00 × 2), an order, then drives `paymentService.createIntent` + `confirmPayment` with a card intent. Returns `{ user, orderId }`.
- **`refund(orderId, amount)`** (local helper) — Wraps `refundOrderPayment` (from `@modules/payments/tests/factories`) with a fixed admin operator (`admin-1`).
- **`describe('the payment')`** — Three tests:
  - Card payment writes `paid` with `method: 'card'` and no `actor`.
  - Offline payment (cash) writes `paid` with the operator name and method.
  - `recordDecline` is idempotent: second call returns `null`; timeline contains exactly one decline row.
- **`describe('a refund')`** — Four tests:
  - Issue + settlement rows share `refundId`, carry `amount`, `currency`, `reason`, and the operator.
  - A provider failure writes `refund_failed` with a closed `failureReason` code; asserts the raw provider text is absent from the stored JSON.
  - Repeated retries with the same reason do **not** create duplicate failure rows; a *different* reason does. Also asserts `paymentRepository` records 4 attempts.
  - Visibility split: buyer sees `paid → refund_issued`; staff additionally sees `refund_failed`.

## Relationships

- **`@modules/payments/services/index.ts`** — Primary subject under test (`paymentService.createIntent`, `confirmPayment`, `recordOfflinePayment`, `retryOpenRefunds`).
- **`@modules/payments/services/announce.ts`** — `recordDecline` called directly to test the decline path and its idempotency.
- **`@modules/orders/tests/factories.ts`** — Provides `createOrder`, `toOrderItem`, and the assertion helper `timelineOf` used to read and shape-assert timeline rows.
- **`@modules/orders/index.ts`** — `orderService.create` (manual offline-payment scenario) and `orderService.readTimeline` (buyer/staff visibility test).
- **`scenarios/support/doubles/payments/fake.ts`** — `fakePaymentProvider` is spied on (`jest.spyOn`) to simulate refund failures; not swapped wholesale, only specific methods are rejected.
- **`@modules/payments/providers/index.ts`** — Source of `PaymentProviderError` used to construct mock rejections.
- **`@modules/payments/repository.ts`** — `paymentRepository.findByOrderId` used to assert internal `attempts` counter.
- **`@modules/payments/module.ts`** — Registered via `registerCheckoutModules` in `beforeEach`.
- **`@kernel/events.ts`** — `resetDomainEvents` in `afterEach` to isolate domain-event state.
- **`@tests/callers.ts`** — `asCustomer`, `asAdmin`, `testCallerContext`, `callerContextAs` supply the caller identities for every service call.
- **`@modules/payments/tests/factories.ts`** — `refundOrderPayment` convenience wrapper for the refund path.
- **`@modules/users/tests/factories.ts`**, **`@modules/products/tests/factories.ts`** — Entity creation helpers.

## Notes

- Tests run against a **real Mongo** (`setupTestDb`), not an in-memory stub. The "public door" comment means assertions go through service/repository APIs, not by poking the provider directly.
- The timeline contract is: rows store **closed codes** (e.g. `insufficient_funds`) and structured money; the provider's free-text message must never leak into stored rows. The "raw provider text" assertion (`JSON.stringify(rows).not.toContain(...)`) is the enforcement mechanism.
- The retry test uses `withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' })` to make `retryOpenRefunds` pick up work immediately without waiting.
- `fakePaymentProvider` is a **shared scenario double** (lives under `scenarios/support/doubles/`), spied on with `jest.spyOn` + `mockRejectedValueOnce`. It is not a locally-constructed mock, so other test files that import it can share the same instance semantics.
- The decline idempotency test calls `recordDecline` directly (not through a service method that would deduplicate), making the guarantee explicit at that layer.
