---
source: src/modules/orders/tests/integration/pii.test.ts
sha256: 9bff616e634f5f0159dc6a49eb6fc8eb162b2c6fbbfb95e16c0660f1a7dc947d
generated_at: 2026-11-08T07:07:38.764230+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/pii.test.ts

## Purpose

Integration test verifying that an order's PII fields (shipping address, billing address, notes) are encrypted at rest in the database and correctly decrypted on every read path (route, search, account export). Also confirms the encryption is bound to the order ID via AAD so ciphertext is non-transferable between orders.

## Key elements

- **`SHIPPING` / `BILLING` / `NOTES`** – Constant fixture values representing the PII fields under test.
- **`seedPiiOrder(user, email?)`** – Helper that creates a product and an order with all encrypted PII fields populated (plus an optional plaintext `email`). Returns the created order.
- **`describe('order PII at rest')`** – The test suite with five cases:
  - *No plaintext in raw collection* – serializes the raw Mongo document and asserts none of the PII strings appear.
  - *Round-trip via GET /orders/{id}* – fires an authenticated HTTP request and checks the response body matches the fixtures.
  - *Decryption in search & export* – calls `orderService.search` and `orderService.findOwnOrders` directly and asserts decrypted values.
  - *Filter/sort on plaintext email* – verifies the non-encrypted `email` field still supports query filters and sort.
  - *AAD binding (cross-order ciphertext)* – copies a raw `notes` ciphertext from one order onto another via a raw `$set`, then asserts that `toJSON()` on the second order throws (decryption failure).

## Relationships

- **`tests/support/setup-test-db.ts`** – calls `setupTestDb()` at module top to prepare a clean test database before any assertions.
- **`tests/support/http.ts`** – uses `api()` for HTTP requests and `authenticateAs('user')` to obtain a bearer token and user document.
- **`src/modules/products/tests/factories.ts`** – imports `createProduct` to seed a valid product for the order line item.
- **`src/modules/orders/tests/factories.ts`** – imports `createOrder` and `toOrderItem` to build the order fixture with PII overrides.
- **`src/modules/orders/services/index.ts`** – imports `orderService` to exercise `search`, `findOwnOrders`, and `ownerScope` as the application-level read paths.
- **`src/modules/orders/model.ts`** – imports `orderModel` to query the raw collection (`findOne`, `updateOne`, `findById`) and to trigger decryption via `toJSON()`.

## Notes

- The AAD test intentionally performs a raw `collection.updateOne` to bypass the service layer and simulate a "stolen" ciphertext. The expected failure is a thrown error from `toJSON()` (the Mongoose getter that calls the decrypt routine), not a soft `null` or empty string.
- The "no plaintext" test checks a handful of distinctive substrings rather than a full redaction regex; adding new PII fields to the fixtures requires adding a corresponding substring to the assertion loop.
- `setupTestDb()` runs at module load (not inside `beforeAll`), so the DB state is ready before any test in this file executes.
