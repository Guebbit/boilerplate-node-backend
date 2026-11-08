---
source: src/modules/payments/tests/integration/staff-reads.test.ts
sha256: b3a38b7cef0af85b51236c94251922a3cb48e436ac66071c342956c77151251e
generated_at: 2026-11-08T07:38:23.316871+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/staff-reads.test.ts

## Purpose

Integration tests (real MongoDB) for the three staff-facing Payment reads — `listPayments`, refund visibility, and `listAttention`. The subject is that every `displayStatus` label the server derives is the same label its filter matches, that provider IDs and failure reasons reach staff but never the payer, and that a needs-attention row disappears once its stored problem is resolved.

## Key elements

- **`seedPayment(overrides?)`** — Creates a user, product, order, and payment document in one call; returns `{ user, order, payment }`. Increments a module-level `sequence` counter so seeded emails stay unique.
- **`seedEveryLabel()`** — Seeds exactly one payment for each `PaymentDisplayStatus` value (incomplete, pending, succeeded, refund_pending, partially_refunded, refunded, failed, canceled) and returns a `Map<PaymentDisplayStatus, string>` of label → payment ID.
- **`staleRefund(hoursAgo)`** — Seeds a payment whose single refund failed `hoursAgo` hours ago (the "stale refund" attention scenario).
- **`backdate(payment, minutesAgo)`** — Rewrites a document's `updatedAt` to a past time using `timestamps: false` so Mongoose doesn't re-stamp it.
- **`idsOf(filters)`** — Calls `paymentService.listPayments(filters, asAdmin())` and returns the first-page IDs in order; used by the filter/sort tests.
- **`attentionRows()`** — Wraps `paymentService.listAttention()` to return the `PaymentAttentionItem[]`.
- **`refundRecord(overrides?)`** — Returns a refund sub-document shape (amount, currency, status, reason, idempotencyKey) for embedding in seeded payments.
- **`idOf(row)`** — Shorthand for `String(row.payment._id)`.
- **Test blocks** — Four `describe` groups: displayStatus label↔filter round-trip, per-row action flags (refund / settleByHand / cancelRefund / pay / sync), filter & sort combinations (method, provider, amount range, order ID, reference, created date, received date, `payBy`, and order-number/email composition), and audience-based field visibility (staff sees providerRef & failureReason; payer does not).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/events.ts` | `resetDomainEvents()` in `afterEach` clears queued domain events between tests. |
| `src/modules/payments/model.ts` | `paymentModel` used for `create`, `findById`, and `updateOne` (backdating). `PaymentDocument` type imported for annotations. |
| `src/modules/payments/services/index.ts` | `paymentService` is the system under test: `listPayments`, `getForOrder`, `listAttention`. |
| `src/modules/payments/services/refunds.ts` | `refundForOrder` imported (available for refund-related assertions). |
| `src/modules/payments/module.ts` | `paymentsModule` registered via `registerCheckoutModules` in `beforeEach`. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem` build the order a payment is attached to. |
| `src/modules/products/tests/factories.ts` | `createProduct` supplies the line-item product. |
| `src/modules/users/tests/factories.ts` | `createUser` supplies the payer. |
| `src/types/index.ts` | `PaymentDisplayStatus` enum and `PaymentAttentionItem` type drive the label-coverage and attention tests. |
| `tests/support/callers.ts` | `asAdmin`, `asCustomer`, `callerContextAs` build the caller-context argument passed to service calls. |
| `tests/support/checkout-modules.ts` | `registerCheckoutModules` wires the module into the app under test each test. |
| `tests/support/environment.ts` | `withEnvironmentOverrides` available for per-test env config. |
| `tests/support/response.ts` | `asSuccess` unwraps the result envelope returned by service methods. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises a real MongoDB instance for the suite. |

## Notes

- **Real DB, no mocks.** `setupTestDb()` provisions a temporary MongoDB; the tests exercise actual Mongo queries, so filter/sort behaviour is verified against the engine, not a stub.
- **`backdate` bypasses Mongoose timestamps.** The `{ timestamps: false }` option is required; without it Mongoose would overwrite `updatedAt` with the current time, defeating the backdating.
- **`sequence` is module-level and never reset.** It exists solely to guarantee unique emails across the entire run; it is not reset in `afterEach` because emails only need to be unique within the DB, not across test files.
- **`seedEveryLabel` is the contract.** It is the single source of truth mapping each `PaymentDisplayStatus` to the stored `status` / `refunds` combination that should derive to it. If the derivation logic changes, this helper must be updated in lockstep with the filter.
- **The file is truncated in the graph snapshot.** The "what each audience is sent" describe block and any `listAttention` tests are partially visible; assume additional assertions exist beyond the cut point.
