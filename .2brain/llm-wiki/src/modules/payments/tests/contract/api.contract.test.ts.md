---
source: src/modules/payments/tests/contract/api.contract.test.ts
sha256: 3e9c540163fd07c34b1f9e07e5f4f6aaba3a48e0c464413f29e55c1c56cc7f58
generated_at: 2026-11-08T07:30:44.106970+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/contract/api.contract.test.ts

## Purpose

HTTP-level contract tests for every `/payments` route. Each test asserts the exact status code, response envelope shape, error-code `code`, and header behavior a client can observe over the wire. Business/money rules are delegated to the unit suite; this file only pins that each documented contract branch (201 intent, 200 confirm, the distinguishable 409s, 404s, 422) is actually reachable and shaped correctly through the real HTTP stack.

## Key elements

- **`GOOD_METHOD` / `DECLINE_METHOD`** – Literal payment-method refs (`pm_card_visa`, `pm_card_declined`) used as HTTP request inputs. Intentionally *not* imported from the fake PSP (see Notes).
- **`authenticateWithOrder`** – Logs in a customer and creates a pending order; returns bearer token and order.
- **`authenticateWithIntent`** – Extends the above by POSTing `/payments` over HTTP to create an intent; returns `paymentId` for confirm tests.
- **`transferOrderOf`** – Creates a `bank_transfer` order with its transfer payment opened (via `openTransferOrder` factory); returns the RF reference.
- **`paidOrder`** – Drives intent → confirm over HTTP to produce a fully-succeeded payment; the starting fixture for refund/dispute tests.
- **`disputeEvent`** – Builds a dispute webhook payload in the shape the contract specifies.
- **`describe('GET /payments/methods')`** – Verifies the unauthenticated methods listing returns 200 with a non-empty array.
- **`describe('with no card payment provider configured')`** – Unsets `NODE_PAYMENT_PROVIDER`; asserts card is absent from methods, `POST /payments` returns 409 `PAYMENT_CARD_NOT_AVAILABLE` with no row created, and the webhook route still dispatches to the registered adapter.
- **`describe('POST /payments')`** – Pins 201 + `Location` on first call, 200 (no `Location`, same id) on repeat; asserts `clientSecret` present only in the 201 body and `providerRef` absent everywhere; 404 for missing order; 422 for empty body.
- **`describe('POST /payments/{id}/confirm')`** – Pins 200 `succeeded` on success, 409 `PAYMENT_DECLINED` on a bad method, 404 for a nonexistent payment, 422 for an unknown method ref.
- *(truncated section)* Dispute-delivery and refund contract tests continue below the visible portion.

## Relationships

- **`tests/support/contract.ts`** – Imported as a side-effect; provides shared contract-test setup (likely supertest/agent configuration or assertion helpers).
- **`scenarios/support/doubles/payments/fake.ts`** – Supplies `fakePaymentProvider`, `setFakeOutcome`, `setFakeRefundFailure`; the fake is registered via the registry so the real HTTP path exercises it.
- **`src/modules/payments/providers/registry.ts`** – `registerPaymentProvider` is called to install the fake adapter before tests run.
- **`src/modules/payments/providers/index.ts`** – Re-exports `signWebhookPayload` and `WEBHOOK_SIGNATURE_HEADER`, used to sign webhook request bodies.
- **`src/modules/payments/repository.ts`** – `paymentRepository.findByOrderId` is queried after a 409 to assert no row was persisted.
- **`src/modules/orders/tests/factories.ts`** – `createOrder` / `toOrderItem` build the pending-order fixture.
- **`src/modules/products/tests/factories.ts`** – `createProduct` creates the line-item product.
- **`src/modules/users/tests/factories.ts`** – `createUser` / `createAdminUser` provision the test accounts.
- **`src/modules/inventory/index.ts` / `services/index.ts`** – `inventoryService` is imported; likely needed because order confirmation triggers inventory side-effects that the test must tolerate or assert.
- **`src/kernel/events.ts`** – `onDomainEvent` registers listeners exercised indirectly through the payment lifecycle.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushes outbox entries so async side-effects complete before assertions.
- **`src/modules/orders/index.ts`** – Exports the `ORDER_STATUS_CHANGED` event constant used by the listener wiring.
- **`src/modules/payments/tests/factories.ts`** – `transferOrder` (aliased `openTransferOrder`) creates the bank-transfer fixture.

## Notes

- **Literals over imports for payment-method refs.** The file deliberately hard-codes `pm_card_visa` / `pm_card_declined` rather than importing the constants from `fake.ts`. The rationale (in a comment) is that a contract test's inputs should come from the provider's published documentation, not from the code under test; importing the double would let a silent rename pass while the test loses its meaning.
- **Idempotency is a contract, not a convenience.** The first `POST /payments` must return 201 + `Location`; a repeat must return 200, the same `id`, and no `Location` header. This is RFC 9110 §15.3.2 behavior pinned explicitly.
- **`clientSecret` visibility is one-shot.** The test asserts the secret appears in the 201 intent body but is absent from the read-back `GET /orders/:id/payments`. No other response in the suite may carry it.
- **Webhook route is env-independent.** Even when `NODE_PAYMENT_PROVIDER` is unset, `POST /payments/webhook/fake` still reaches the registered adapter (204). The routing decision is made by the URL path, not the environment variable.
- **Real database.** `setupTestDb()` is called at module level; these tests run against a real (test) database, not an in-memory stub.
