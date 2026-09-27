---
source: src/modules/payments/tests/contract/api.contract.test.ts
sha256: f51493259a0c34eb4f2099cdf7716e8d7fb1d7690151debe982f4d85696a4a9e
generated_at: 2026-09-27T15:28:19.335425+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/contract/api.contract.test.ts

## Purpose
HTTP-level contract tests for the `/payments` API. Each test fires a real request through the running server and asserts both the semantic shape of the response and conformance to the OpenAPI spec (`toSatisfyApiSpec()`). The goal is to prove that every documented branch — 201 intent, 200 confirm, the three distinct 409s, 404s, 422s — is actually reachable over the wire, without re-testing the business rules (those live in the unit suite).

## Key elements

- **`GOOD_METHOD` / `DECLINE_METHOD`** – Literal payment-method-ref strings (`pm_card_visa`, `pm_card_declined`). Deliberately *not* imported from the provider module so a rename in production code cannot silently pass the contract.
- **`authenticateWithOrder`** – Logs in a test user, creates a product and a pending order; returns the bearer token and order.
- **`authenticateWithIntent`** – Calls the above, then POSTs `/payments/intent` over HTTP; returns `bearer`, `order`, `paymentId`.
- **`transferOrder`** – Creates a `bank_transfer` order whose `_id` is pinned *before* `buildReference` is called, mirroring checkout's reference-generation order.
- **`paidOrder`** – Drives a full intent → confirm cycle over HTTP to produce a `succeeded` payment; used as the starting state for refund tests.
- **`describe` blocks** – One per endpoint: `GET /payments/methods`, `POST /payments/intent`, `POST /payments/{id}/confirm`, `POST /payments/{id}/sync` (and, in the truncated remainder, refund). Each block asserts status, body fields, and spec conformance.

## Relationships

- **`tests/support/contract.ts`** – Side-effect import (`@tests/contract`) that registers the `toSatisfyApiSpec` matcher against the OpenAPI document.
- **`tests/support/http.ts`** – Provides `api()` (supertest-style request helper) and `authenticateAs()` used by every test.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the in-memory/test database before the suite runs.
- **`tests/support/ids.ts`** – `MISSING_ID` supplies a valid-format but non-existent ObjectId for 404 tests.
- **`src/modules/products/tests/factories.ts`** – `createProduct` seeds a catalogue item for order creation.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem` build the order fixtures.
- **`src/modules/orders/index.ts`** – Exports `buildReference` (used by `transferOrder`) and `ORDER_STATUS_CHANGED` (subscribed via the kernel to drive side-effects in tests).
- **`src/modules/orders/domain/transfer-reference.ts`** – Source of `buildReference`, re-exported through orders index.
- **`src/modules/payments/providers/index.ts`** – Exports `signWebhookPayload` and `WEBHOOK_SIGNATURE_HEADER` (used in webhook-related tests further in the file).
- **`src/modules/payments/providers/webhook-signature.ts`** – Underlying signature logic re-exported by the providers index.
- **`src/modules/payments/repository.ts`** – `paymentRepository` used for post-condition assertions (e.g., verifying a row was written or not).
- **`src/modules/inventory/index.ts` / `service.ts`** – `inventoryService` used to assert or reset stock levels that the payment flow mutates.
- **`src/kernel/events.ts`** – `onDomainEvent` subscription mechanism; the file listens for `ORDER_STATUS_CHANGED` to verify domain events fire when a payment settles.

## Notes

- **No import of the module under test for input values.** Payment-method refs and webhook headers are hard-coded literals. The file's own comment explains: importing them would let a production rename pass silently while the contract document no longer matches reality.
- **Fixtures go over HTTP.** `paidOrder` does not write a payment row directly; it performs intent + confirm through the API, so the tests exercise the full path including middleware and serialisation.
- **`transferOrder` pins the ObjectId first.** The order's `_id` is generated and stored *before* `buildReference(id)` is called, matching the checkout flow's ordering. Reversing the order would produce a reference no one can look up.
- **The "already-succeeded sync" test is not an idempotency test.** The inline comment explicitly notes the test calls `sync` exactly once against a terminal payment; it pins the early-return branch that answers from the stored row without calling the provider.
- **`setupTestDb()` is called at module top-level**, not inside `beforeAll`; the `@tests/contract` import is likewise a side-effect import at the top, not a function call.
- **The file is truncated in the provided content**; the visible portion ends mid-test in the `sync` block. Additional `describe` blocks (refunds, webhooks, reference lookup) are expected beyond the cut point.
