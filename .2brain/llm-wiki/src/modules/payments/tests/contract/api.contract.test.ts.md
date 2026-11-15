---
source: src/modules/payments/tests/contract/api.contract.test.ts
sha256: 04984ceacb344742f0703f395944d2a03275dd6f2c4869964754719636fef487
generated_at: 2026-11-14T21:11:00.616029+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/contract/api.contract.test.ts

## Purpose

Contract (integration) tests for the `/payments` HTTP surface. Every route's status code, response envelope shape, and error discriminator are pinned over real HTTP against a live app with a fake payment provider. The file explicitly defers money-rule logic to the unit suite; here the job is to prove that each contract branch — 201 intent, 200 confirm, the three distinguishable 409s, 404s, 422 — is actually reachable and shaped as the API contract specifies.

## Key elements

- **`authenticateWithOrder`** — helper: creates an authenticated user with one pending order; returns bearer + order.
- **`authenticateWithIntent`** — builds on the above, then issues `POST /payments` to produce a confirmed intent (201); returns bearer, order, and paymentId.
- **`transferOrderOf`** — creates a pending `bank_transfer` order with its transfer payment opened; used by dispute/refund delivery tests.
- **`paidOrder`** — full HTTP round-trip to a `succeeded` payment; fixture for refund and dispute tests.
- **`disputeEvent`** — builds a dispute delivery payload (chargeback shape) for webhook delivery tests.
- **`describe('GET /payments/methods')`** — verifies the public method list includes `card` and requires no auth.
- **`describe('with no card payment provider configured')`** — unsets `NODE_PAYMENT_PROVIDER`; asserts `card` is absent from methods, `POST /payments` returns 409 `PAYMENT_CARD_NOT_AVAILABLE` with no row created, and the webhook route still resolves via path (not env).
- **`describe('POST /payments')`** — 201 intent shape, idempotent re-request (200, same id, no `Location`), `providerRef` never leaked, `clientSecret` only on intent creation, 404 / 422 error contracts.
- **`describe('POST /payments/{id}/confirm')`** — 200 success, 409 `PAYMENT_DECLINED`, 404, and a parametrized rejection of raw card numbers as `paymentMethodRef`.
- **`describe('POST /payments/webhook/...')`** — (in truncated portion) verifies webhook signature enforcement and dispute/refund event delivery via the fake provider.
- **`GOOD_METHOD` / `DECLINE_METHOD`** — hard-coded provider method refs (`pm_card_visa`, `pm_card_declined`). Deliberately *not* imported from the fake PSP to keep the test independent of internal renames.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — provides `fakePaymentProvider`, `setFakeOutcome`, `setFakeRefundFailure`; the in-process PSP the app talks to instead of a real gateway.
- **`src/modules/payments/providers/registry.ts`** — `registerPaymentProvider` is called in setup to install the fake so the app resolves it by name.
- **`src/modules/payments/providers/index.ts`** — exports `signWebhookPayload` and `WEBHOOK_SIGNATURE_HEADER` used to craft valid (or invalid) webhook requests.
- **`src/modules/payments/repository.ts`** — `paymentRepository.findByOrderId` is queried to assert no row was persisted after a 409.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem` build the order fixtures the tests operate on.
- **`src/modules/products/tests/factories.ts`** — `createProduct` supplies the line-item product.
- **`src/modules/users/tests/factories.ts`** — `createUser` / `createAdminUser` for auth setup.
- **`src/modules/payments/tests/factories.ts`** — `openTransferOrder` creates a `bank_transfer` order + payment pair for delivery tests.
- **`src/kernel/events.ts`** — `onDomainEvent` subscribes to domain events to observe side-effects of payment-driven transitions.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` flushes pending outbox entries so event-driven assertions can complete.
- **`src/modules/orders/index.ts`** — source of the `ORDER_STATUS_CHANGED` event constant.
- **`src/modules/inventory/index.ts`** — inventory service consumed as part of the payment→order status transition.
- **`src/modules/inventory/services/index.ts`** — inventory service implementation invoked when a payment settles an order.
- **`tests/support/contract.ts`** — `@tests/contract` import; provides shared contract-test assertions or setup the file relies on via side-effect.

## Notes

- **Literals over imports for provider refs.** `GOOD_METHOD` and `DECLINE_METHOD` are hard-coded strings, not imports from the fake PSP. The rationale (stated in a comment): a contract test's inputs should come from the provider's published documentation, not from the code under test. Importing would let a rename silently break the test's meaning.
- **Idempotency is a contract here.** `POST /payments` on an existing intent returns 200 (same `id`, no `Location` header), while the first call returns 201 + `Location`. This is an explicit RFC 9110 §15.3.2 assertion, not an implementation detail.
- **`providerRef` vs `clientSecret` secrecy.** The test asserts `providerRef` is absent from *all* client-facing responses, while `clientSecret` appears only on the 201 intent body and nowhere in read-back endpoints. Both rules are pinned in a single test to catch a regression in either direction.
- **Environment mutation.** The "no card provider" suite calls `setEnvironment({ NODE_PAYMENT_PROVIDER: undefined })` in `beforeEach`, relying on the app reading env at request time. This is a deliberate simulation of a deployment without a card adapter.
- **`setupTestDb()` at module scope.** The file is not a pure unit test; it boots a real (or emulated) database, so the repository-level assertions (no row after 409) are meaningful.
- **File is truncated in the source provided.** The confirm, webhook, and dispute-delivery `describe` blocks continue past the cut point; the patterns and helpers above are sufficient to orient a reader without re-reading the full file.
