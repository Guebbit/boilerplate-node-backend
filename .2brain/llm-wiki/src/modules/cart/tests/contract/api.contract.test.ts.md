---
source: src/modules/cart/tests/contract/api.contract.test.ts
sha256: 048392941eecdd03ed290ec8b8f4a9b55cc3c2f4d39baf39f9600661927ce484
generated_at: 2026-09-23T18:33:21.945545+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/contract/api.contract.test.ts

## Purpose

Contract tests for every `/cart` route. All six endpoints share a single `CartResponseEnvelope` shape, making serialization drift easy to hide. The cart is built through real API calls (not fixtures) because `CartResponse` is a computed view, not a document serialization—hand-written fixtures would assert a shape the app never produces. The suite's goal is to guarantee each declared contract branch (200, 201, 404, 409, 422) is actually reached.

## Key elements

- **`MISSING_ID`** — A fixed, valid ObjectId guaranteed to match no document; used to exercise the 404 "not found" branch distinct from the 404 "not in scope" branch.
- **`authenticateWithCart(quantity?)`** — Helper that logs in a user, creates a product, and posts it to the cart via the API. Returns `{ bearer, product }`.
- **`describe('GET /cart')`** — Empty cart and populated cart; asserts `toSatisfyApiSpec()`.
- **`describe('POST /cart')`** — Happy path, 404 for nonexistent product, 404 for inactive (out-of-scope) product.
- **`describe('DELETE /cart')`** — Remove one item (seeds two lines to distinguish from clear-all), 422 for missing body, 404 for product not in cart.
- **`describe('DELETE /cart/all')`** — Clear-all returns empty items array.
- **`describe('PUT /cart/{productId}')`** — Set quantity, 422 for invalid body (`quantity: 0`), 404 for nonexistent id, 404 for inactive product.
- **`describe('DELETE /cart/{productId}')`** — Remove by path id, 422 for malformed id (`not-an-id`).
- **`describe('GET /cart/summary')`** — Empty and populated states.
- **`describe('POST /cart/checkout')`** — 201 on success, `notes` passthrough regression (B3), 422 for unknown payment method, cart-emptied-on-success check, 409 for empty cart.

## Relationships

- **`tests/support/contract.ts`** (`@tests/contract`) — Side-effect import that registers the `toSatisfyApiSpec()` matcher used in every assertion.
- **`tests/support/http.ts`** — Provides `api()` (supertest-style HTTP client) and `authenticateAs()` (OAuth/bearer token acquisition).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` called once at module top to reset the test database before any test runs.
- **`tests/support/environment.ts`** — `withEnvironment` / `withoutEnvironment` imported (available for env-dependent tests in this file or sibling suites).
- **`src/modules/products/tests/factories.ts`** — `createProduct()` (with optional `{ active: false }`) supplies real catalogue rows for add/checkout scenarios.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem` imported; available if the checkout test needs to assert against order documents.
- **`src/modules/users/tests/factories.ts`** — `createUser()` imported for user provisioning in auth setup.

## Notes

- **404 ≠ 404:** The file deliberately tests *two* distinct 404 paths on POST and PUT: a well-formed id that matches nothing (existence check) vs. a real row with `active: false` (scope/permission refusal). Both return 404 but fail at different layers.
- **DELETE /cart vs DELETE /cart/all:** The body-based remove requires `productId`; the file comments note it is aliased to `removeCartItem` in the spec. The clear-all route takes no body.
- **B3 regression (`notes` passthrough):** The checkout controller previously cast `request.body` without contract parsing, silently dropping the `notes` field. The test asserting `response.body.data.order.notes` is a guard against reintroduction.
- **409 on empty-cart checkout:** The spec did not originally declare this status; the implementation always returned 409. The test was added when this suite was written and the spec updated to match.
- **No service-level behaviour assertions:** Business rules (e.g., max quantity, stock checks) belong to the service test suites. This file only verifies that each declared status/response shape is reachable and well-formed.
