---
source: src/modules/payments/tests/integration/staff-reads.test.ts
sha256: 0be4ae46cc93edaeea3dd0fa9dadfb70cd8f22116341856050169bce0af8d4b2
generated_at: 2026-10-15T11:37:26.501601+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/staff-reads.test.ts

## Purpose

Integration tests (real Mongo) for the three staff-facing payment reads — `listPayments`, `listRefunds`, and `listAttention`. Validates that every derived `displayStatus` label is consistent with the filter that selects on it, that provider identifiers and failure details reach staff only, and that an attention row disappears once `retryOpenRefunds` has swept the underlying problem.

## Key elements

- **`seedPayment(overrides?)`** — Creates a user, product, order, and payment document in one shot; increments a module-level `sequence` counter to guarantee unique customer emails.
- **`seedEveryLabel()`** — Seeds exactly one payment per `PaymentDisplayStatus` value and returns a `Map<label, paymentId>` for assertion.
- **`staleRefund(hoursAgo)`** — Seeds a payment whose single refund failed `hoursAgo` hours ago (a "stale refund" attention case).
- **`backdate(payment, minutesAgo)`** — Rewrites `updatedAt` via a raw `updateOne` with `{ timestamps: false }` so Mongoose doesn't re-stamp it.
- **`idsOf(filters)`** — Shorthand: runs `listPayments` as admin and returns the `id` array of the first page.
- **`attentionRows()`** — Runs `listAttention` and returns the item array.
- **`refundRecord(overrides?)`** — Builds a refund sub-document with a default shape; spreads overrides for per-case variation.
- **`describe('listPayments by displayStatus')`** — Core invariant: filtering by each label returns exactly the payment that derives to it, and the returned item's `displayStatus` matches the label.
- **`describe('listPayments filters and sort')`** — Exercises method, provider, amount range, order-id, reference, date (`createdTo`/`receivedFrom`), and `sort` (asc/desc) filters; also verifies row composition (order number + email).
- **`describe('what each audience is sent')`** — Confirms staff receive `providerRef` and refund `failureReason`/`providerRefundRef`, while the payer's payload contains none of them.
- **`describe('listRefunds')`** — Verifies cross-payment refund listing, newest-first ordering, and `status` / `createdTo` filters.
- **`describe('listAttention')`** — Seeds a stale provider refund, asserts it appears, runs `retryOpenRefunds()`, then asserts the attention list is empty. Uses `withEnvironment` to set `NODE_PAYMENT_EFFECT_RETRY_MINUTES=0`.

## Relationships

- **`src/modules/payments/services/index.ts`** — Source of all six service functions under test (`listPayments`, `listRefunds`, `listAttention`, `getForOrder`, `methodMix`, `retryOpenRefunds`).
- **`src/modules/payments/model.ts`** — Provides `paymentModel` (Mongoose model used for seeding and `backdate`) and the `PaymentDocument` type.
- **`src/modules/payments/module.ts`** — Registered via `registerCheckoutModules` in `beforeEach` so the service layer resolves within the test runtime.
- **`src/modules/orders/index.ts`** — Exports `orderService` (imported; likely used in the truncated portion for order-state setup).
- **`src/modules/orders/tests/factories.ts`** — `createOrder` / `toOrderItem` build the order fixture each payment hangs from.
- **`src/modules/users/tests/factories.ts`** — `createUser` supplies the payer per seed.
- **`src/modules/products/tests/factories.ts`** — `createProduct` supplies the order line-item.
- **`src/kernel/events.ts`** — `resetDomainEvents` in `afterEach` prevents event-bus leakage between tests.
- **`src/types/index.ts`** — Exports `PaymentDisplayStatus` enum and `PaymentAttentionItem` type used throughout.

## Notes

- The `sequence` counter is module-scoped, not reset per test; it exists solely to avoid email collisions when `seedPayment` runs many times in one file.
- `backdate` must pass `{ timestamps: false }` to `updateOne`; without it Mongoose would overwrite `updatedAt` with the current time, defeating the purpose.
- `withEnvironment('NODE_PAYMENT_EFFECT_RETRY_MINUTES', '0', …)` is the mechanism that makes `retryOpenRefunds` treat a 3-hour-old failed refund as immediately retryable — without it the attention row would never clear in the test.
- `methodMix` and `freezeDate` are imported but their usage is in the truncated tail of the file.
- The audience-separation test uses `JSON.stringify(payer)` to assert that no provider ref or failure reason leaks, rather than checking individual keys — this catches accidental nesting.
