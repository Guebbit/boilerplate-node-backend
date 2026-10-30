---
source: src/modules/payments/tests/integration/staff-reads.test.ts
sha256: f179d137639e7cd237b4f6d70b628269ec95ead6d93db8a2db9a08721615a943
generated_at: 2026-10-29T05:22:20.066659+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/staff-reads.test.ts

## Purpose

Integration tests for the three staff-facing payment reads (list, per-order detail, needs-attention) executed against a real MongoDB instance. Verifies that every derived `displayStatus` label round-trips through its own filter, that provider identifiers and failure details are exposed only to staff callers, and that needs-attention rows clear once the underlying problem is resolved.

## Key elements

- **`seedPayment(overrides?)`** – Creates a user, product, order, and a `PaymentDocument` in one call; returns `{ user, order, payment }`. Increments a module-level `sequence` to keep emails unique.
- **`seedEveryLabel()`** – Seeds one payment per `PaymentDisplayStatus` variant and returns a `Map<label, paymentId>` for the displayStatus round-trip test.
- **`refundRecord(overrides?)`** – Shorthand factory producing a refund sub-document with sensible defaults.
- **`backdate(payment, minutesAgo)`** – Rewrites `updatedAt` directly via `paymentModel.updateOne` (bypassing Mongoose timestamps) so time-based assertions are deterministic.
- **`idsOf(filters)`** – Thin wrapper over `paymentService.listPayments` that returns just the ordered `id` array of the first page.
- **`staleRefund(hoursAgo)`** – Seeds a payment whose single refund failed `hoursAgo` hours ago; used by needs-attention tests.
- **`attentionRows()`** – Calls `paymentService.listAttention()` and returns the items array.
- **`describe` blocks** – One each for: displayStatus filter round-trip; per-row action flags (refund, settleByHand, cancelRefund, pay, sync); filters (method, provider, amount range, order, reference, created/received date) and sort (amount, payBy); audience-specific field visibility (staff vs. payer).

## Relationships

- **`@modules/payments/services`** (`paymentService`) – Primary subject under test; all assertions go through `listPayments`, `getForOrder`, and `listAttention`.
- **`@modules/payments/model`** (`paymentModel`, `PaymentDocument`) – Used for direct DB seeding (`create`), lookups (`findById`), and the `backdate` helper.
- **`@modules/payments/module`** (`paymentsModule`) – Registered via `registerCheckoutModules` in `beforeEach` so the service layer is wired for the test environment.
- **`@modules/payments/services/refunds`** (`refundForOrder`) – Imported (likely used in the truncated needs-attention / refund-resolution tests).
- **`@kernel/events`** (`resetDomainEvents`) – Called in `afterEach` to prevent event-bus leakage between tests.
- **`@modules/users/tests/factories`** / **`@modules/products/tests/factories`** / **`@modules/orders/tests/factories`** – Domain factories that `seedPayment` chains to build a realistic order graph.
- **`@types`** – Provides the `PaymentDisplayStatus` enum and `PaymentAttentionItem` shape used in assertions and seeding.
- **`tests/support/callers`** – `asAdmin()`, `asCustomer(id)`, `callerContextAs` supply the caller contexts for staff vs. payer audience tests.
- **`tests/support/response`** – `asSuccess` unwraps the service response envelope for direct field assertions.
- **`tests/support/checkout-modules`** – `registerCheckoutModules` boots the payments module in isolation each test.
- **`tests/support/setup-test-db`** – `setupTestDb()` provisions and truncates the Mongo instance before the suite runs.
- **`tests/support/environment`** – `withEnvironmentOverrides` imported for per-test env config (used in truncated section).

## Notes

- `sequence` is a **module-level mutable counter** (not reset per test). It exists solely to guarantee unique payer emails across the whole file; it will never collide with factory-internal counters because the prefix is `payer{n}@example.com`.
- The `backdate` helper passes `{ timestamps: false }` to `updateOne` to prevent Mongoose from re-stamping `updatedAt`—a necessary escape hatch for any test that asserts on `updatedAt` or time-ordered sorting.
- Audience-visibility tests assert on **both** the per-order detail (`getForOrder`) and the list row (`listPayments`) to confirm the projection difference is consistent across endpoints.
- The file is truncated in this snapshot; the needs-attention "clears once fixed" scenario (the third read named in the module docstring) lives beyond the visible portion.
