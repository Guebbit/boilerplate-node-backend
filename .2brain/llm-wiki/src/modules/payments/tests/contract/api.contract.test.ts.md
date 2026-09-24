---
source: src/modules/payments/tests/contract/api.contract.test.ts
sha256: 28393a6460628453c084f8646f2befd3aebc440f4923dfd44b399698228c9024
generated_at: 2026-09-23T19:23:01.512023+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/contract/api.contract.test.ts

## Purpose

HTTP contract tests for every `/payments` route. They assert that each status-code branch the OpenAPI spec declares (201 intent, 200 confirm/sync, the three distinguishable 409s, 404, 422) is actually reachable over the wire and that the response body satisfies the published schema. Business/money rules are left to the unit suite; this file pins only the wire contract.

## Key elements

- **`MISSING_ID`** – A syntactically valid ObjectId guaranteed not to exist, used to exercise the 404 branch (not the 422 validation branch).
- **`GOOD_METHOD` / `DECLINE_METHOD`** – Literal provider-method strings (`pm_card_visa`, `pm_card_declined`). Deliberately hard-coded rather than imported from the provider module so a rename in code cannot silently keep a broken contract passing.
- **`authenticateWithOrder()`** – Fixture helper: logs in a user and creates a pending order.
- **`authenticateWithIntent()`** – Builds on the above; also issues `POST /payments/intent` and returns the `paymentId`.
- **`transferOrder()`** – Creates a pending `bank_transfer` order with a pinned order ID and a reference minted via `buildReference`, mirroring what checkout does.
- **`paidOrder()`** – Drives the full intent → confirm cycle over HTTP to produce a `succeeded` payment, used as the starting state for refund tests.
- **`describe('GET /payments/methods')`** – Verifies the unauthenticated methods list returns 200 and satisfies the spec.
- **`describe('POST /payments/intent')`** – Covers 201 happy path, `providerRef`/`clientSecret` visibility rules, 404 (missing order), and 422 (empty body).
- **`describe('POST /payments/{id}/confirm')`** – Covers 200 success, 409 declined, 404, 422 (spaces in ref, min/max length), and 200 with `requires_action` for authentication challenges.
- **`describe('POST /payments/{id}/sync')`** – Covers settling an in-flight payment and the terminal early-return path (already-succeeded payment answered from the row without a provider call).

## Relationships

- **`tests/support/contract.ts`** – Supplies the `toSatisfyApiSpec()` matcher used on every assertion to validate the response against the OpenAPI document.
- **`tests/support/http.ts`** – Provides the `api()` supertest wrapper and `authenticateAs()` helper for every HTTP call in the file.
- **`tests/support/setup-test-db.ts`** – Initialises the in-memory / test database via `setupTestDb()` at module load.
- **`src/modules/products/tests/factories.ts`** – `createProduct` creates the catalog item needed to build an order.
- **`src/modules/orders/tests/factories.ts`** – `createOrder` and `toOrderItem` build the order fixtures that every payment test depends on.
- **`src/modules/orders/index.ts`** – Exports `buildReference`, used by `transferOrder()` to mint a bank-transfer reference the same way checkout does.
- **`src/modules/orders/domain/transfer-reference.ts`** – Implementation behind `buildReference`.
- **`src/modules/payments/providers/index.ts`** – Re-exports `signWebhookPayload` and `WEBHOOK_SIGNATURE_HEADER` (imported here, likely consumed by sync/webhook assertions in the truncated portion).
- **`src/modules/payments/providers/webhook-signature.ts`** – Concrete implementation of the webhook signature utilities.
- **`src/modules/payments/repository.ts`** – `paymentRepository` allows direct DB reads to assert internal state (e.g. stored `providerRef`) without an extra HTTP round-trip.
- **`src/modules/inventory/index.ts` / `service.ts`** – `inventoryService` is imported to verify inventory side-effects (e.g. stock decrement on confirm) in the truncated portion.
- **`src/kernel/events.ts`** – `onDomainEvent` and `ORDER_STATUS_CHANGED` let tests subscribe to domain events to assert cross-module reactions (e.g. order status transitions triggered by a payment settling).

## Notes

- **Literal over import for method IDs.** `GOOD_METHOD` and `DECLINE_METHOD` are strings taken from the OpenAPI spec, not from the provider module. This ensures a rename or removal in code will fail the contract test rather than silently pass.
- **`MISSING_ID` is a valid ObjectId.** Using a random string would hit the 422 validation branch instead of the 404 "resource not found" branch the spec defines.
- **Authentication-challenge case returns 200, not 4xx.** A 4xx would tell the browser to abort, but the browser is the only component that can complete the challenge; the contract requires the payment to stay in `requires_action` with a 200.
- **Length-bound tests were added retroactively.** The `minLength: 3` / `maxLength: 255` constraints on `paymentMethodRef` were previously untested (only the `pattern`/spaces rule was exercised), so a length regression would have gone undetected.
- **The sync "already-succeeded" test is not an idempotency test.** It calls sync exactly once against a payment that is already terminal, pinning the early-return branch that answers from the DB row without a provider round-trip.
