---
source: src/modules/payments/tests/contract/api.contract.test.ts
sha256: 0f6ce014817b339adc139142d7c44eafce897e99172d36dc385671f47de489d2
generated_at: 2026-10-29T05:14:57.011483+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/contract/api.contract.test.ts

## Purpose

HTTP-level contract tests for every `/payments` route. Each test asserts that the correct status code, response shape, error code, and authentication requirement are reachable over a real HTTP round-trip. Business rules (amount math, state transitions) are deliberately left to the unit suite; this file pins the *shape* of the API so a client integration never silently breaks.

## Key elements

- **`GOOD_METHOD` / `DECLINE_METHOD`** – String literals (`pm_card_visa`, `pm_card_declined`) used as provider inputs. Intentionally *not* imported from the fake double so a rename in the double cannot silently void the test.
- **`authenticateWithOrder()`** – Creates a user, a product (price 10), and an order with 2 items; returns bearer token + order.
- **`authenticateWithIntent()`** – Extends the above by POSTing to `/payments` to open a payment intent; returns bearer, order, and `paymentId`.
- **`transferOrderOf()`** – Sets up a `bank_transfer` order with its RF reference payment already opened (via `../factories` `transferOrder`).
- **`paidOrder()`** – Drives the full intent → confirm flow over HTTP to produce a `succeeded` payment for refund tests.
- **`disputeEvent()`** – Builds a dispute webhook payload shaped exactly as the provider contract defines it.
- **`describe` blocks** – Cover: `GET /payments/methods` (public, no auth), no-provider-configured scenarios (409 `PAYMENT_CARD_NOT_AVAILABLE`, webhook still routable), `POST /payments` (201 intent, 200 idempotent re-ask, 404, 422, `providerRef`/`clientSecret` visibility), `POST /payments/{id}/confirm` (200 success, 409 decline, 404, disallowed method), and (truncated) refund / dispute / webhook paths.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** – Provides `fakePaymentProvider`, `setFakeOutcome`, `setFakeRefundFailure`; registered via the provider registry before tests run.
- **`src/modules/payments/providers/registry.ts`** – `registerPaymentProvider` installs the fake so the app-under-test dispatches to it.
- **`src/modules/payments/providers/webhook-signature.ts`** – `signWebhookPayload` signs the body for webhook tests; `WEBHOOK_SIGNATURE_HEADER` is the expected header name.
- **`src/modules/payments/providers/index.ts`** – Re-exports the above for the test's import convenience.
- **`src/modules/payments/repository.ts`** – `paymentRepository.findByOrderId` used to assert nothing was persisted in error cases.
- **`src/kernel/events.ts`** – `onDomainEvent` subscribes to domain events (e.g. `ORDER_STATUS_CHANGED`) fired during confirm/refund flows.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushes the transactional outbox so side-effect assertions (inventory reservation, order status) complete.
- **`src/modules/inventory/index.ts` / `services/index.ts`** – `inventoryService` participates in reservation release on refund.
- **`src/modules/orders/index.ts`** – Exports `ORDER_STATUS_CHANGED` event constant.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem` build order fixtures.
- **`src/modules/users/tests/factories.ts`** – `createUser`, `createAdminUser` build auth fixtures.
- **`src/modules/products/tests/factories.ts`** – `createProduct` builds a priced product.
- **`src/modules/payments/tests/factories.ts`** – `transferOrder` builds a `bank_transfer` order with its RF payment.
- **`tests/support/contract.ts`** – Shared contract-test setup (superagent instance, error-body helpers) imported as a side-effect (`@tests/contract`).

## Notes

- **Literals over imports for provider method IDs.** The file deliberately hard-codes `pm_card_visa` and `pm_card_declined` rather than importing them from the fake. A rename in the fake would otherwise let a test pass while no longer exercising the real provider contract value.
- **201 vs 200 idempotency.** `POST /payments` for an already-existing intent returns 200 (same `id`, no `Location` header) on the second call; only the first call is 201 + `Location`. This is asserted explicitly and cites RFC 9110 §15.3.2.
- **`providerRef` and `clientSecret` visibility.** `providerRef` must never appear in any client-facing response; `clientSecret` appears only in the 201/200 intent creation response and is never stored or re-read. The test checks both via the intent response *and* the `GET /orders/:id/payments` read-back.
- **No-provider environment.** `setEnvironment({ NODE_PAYMENT_PROVIDER: undefined })` in `beforeEach` exercises the "card unavailable" 409 path, yet the webhook route `/payments/webhook/fake` still returns 204 because routing is decided by the URL path, not the env var.
- **File is truncated in the source snapshot** – the refund, dispute-webhook, and `bank_transfer` settlement describe blocks are implied by the helpers but not visible here.
