---
source: src/modules/payments/tests/integration/refund-cancel.test.ts
sha256: a9efd23eca2ce3828900ffdce2d4afe76a523df1ec6c75ff8632f2f613b694a4
generated_at: 2026-10-29T05:18:22.271852+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refund-cancel.test.ts

## Purpose

Integration test for the "void a refund" operation (staff cancelling a refund before money moves). It exercises the full path through `paymentService.cancelRefund` against a real MongoDB instance, covering the happy path (pending hand-paid refund, clearly-refused card refund), the guarded paths (settled refund, unclear failure, in-flight race), and the side-effect guarantees (audit row, timeline entry, outbox event, no credit note, no mail).

## Key elements

- **`freshOrder`** – helper that creates a user, a 50.00 product, and a 2-unit (100.00) order.
- **`paymentOf`** – fetches the payment document by order ID via `paymentRepository`.
- **`cashRefund`** – records an offline cash payment and creates a 30.00 hand-paid refund in `pending` status.
- **`refusedRefund(reason)`** – records a card payment, then triggers a 30.00 refund that the fake provider rejects with the given `RefundFailureReason`.
- **`cancel`** – thin wrapper around `paymentService.cancelRefund` with admin caller context.
- **`audited: AuditEntry[]`** – in-memory buffer fed by `registerAuditSink`; reset each test.
- **Test suites:**
  - *"cancelling a hand-paid refund that waits"* – status → `failed`/`canceled`, share released, audit/timeline/outbox written once, `cancelRefund` action disappears, re-refund possible, double-cancel → 409 `PAYMENT_REFUND_NOT_OPEN`, settle-by-hand → 409.
  - *"cancelling a card refund refused as declined / insufficient_funds"* – void succeeds; `retryOpenRefunds` and `listAttention` confirm the sweep never re-sends.
  - *"cancelling a card refund left unclear as provider_unavailable / unknown"* – 409 `PAYMENT_REFUND_IN_FLIGHT`; record untouched.
  - *"cancelling a refund that already paid out"* – 409 `PAYMENT_REFUND_NOT_OPEN`.
  - *"cancelling against a racing sweep"* – mocks `paymentRepository.cancelRefund` to let `claimRefund` win first; expects `PAYMENT_REFUND_IN_FLIGHT`.

## Relationships

| Neighbor | Role in this file |
|---|---|
| `src/modules/payments/services/index.ts` | SUT – all assertions go through `paymentService` (cancelRefund, settleRefundByHand, getForOrder, retryOpenRefunds, listAttention). |
| `src/modules/payments/repository.ts` | Direct DB reads (`findByOrderId`) and race-condition mocking (`cancelRefund`, `claimRefund`). |
| `src/modules/payments/events.ts` | `PAYMENT_REFUNDED` / `PAYMENT_REFUND_CANCELED` names used in outbox assertions. |
| `src/modules/payments/module.ts` | Registered via `registerCheckoutModules` in `beforeEach`. |
| `src/modules/payments/tests/factories.ts` | `payByCard`, `refundOrderPayment` setup helpers. |
| `scenarios/support/doubles/payments/fake.ts` | `fakePaymentProvider` (spied in sweep test) and `setFakeRefundFailure` to inject refusals. |
| `src/kernel/outbox.ts` | `settleOutboxNudges` to flush; `outboxEventModel` to count emitted events. |
| `src/kernel/events.ts` | `resetDomainEvents` in `afterEach`. |
| `src/infrastructure/observability/audit.ts` | `registerAuditSink` / `AuditEntry` to capture and assert audit rows. |
| `tests/support/checkout-modules.ts` | `registerCheckoutModules` bootstraps the module graph for the test. |
| `tests/support/callers.ts` | `asAdmin`, `callerContextAs` supply caller identity. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem`, `timelineOf`. |
| `src/modules/users/tests/factories.ts` | `createUser`. |
| `src/modules/products/tests/factories.ts` | `createProduct`. |
| `src/types/index.ts` | `RefundFailureReason` union type. |

## Notes

- Runs against **real MongoDB** (`setupTestDb`), not an in-memory store; all interactions go through the service's public API.
- The "racing sweep" test spies on `paymentRepository.cancelRefund` and has it call `claimRefund` first, simulating a concurrent sweep that wins the write race.
- `withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' })` is used in the card-refusal and race suites to make the sweep immediately eligible.
- The timeline assertion verifies that the operator's free-text `note` does **not** leak into the order timeline (data-minimisation guard).
- `describe.each` is used to parameterise over the two "clear" refusal reasons vs. the two "unclear" ones, keeping the two classes of refusal distinct.
