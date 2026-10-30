---
source: src/modules/orders/tests/integration/pii.test.ts
sha256: 9bff616e634f5f0159dc6a49eb6fc8eb162b2c6fbbfb95e16c0660f1a7dc947d
generated_at: 2026-10-29T04:55:14.855036+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/pii.test.ts

## Purpose

Integration tests verifying that order PII fields (`shippingAddress`, `billingAddress`, `notes`) are encrypted at rest in the database and correctly decrypted on every read path (HTTP route, service-level search, account export). Also confirms that ciphertext is bound to a specific order via AAD so it cannot be replayed against another document.

## Key elements

- **`SHIPPING`, `BILLING`, `NOTES`** — constant fixture objects containing the PII values that must never appear in plaintext at rest.
- **`seedPiiOrder(user, email?)`** — helper that creates a product, then an order with all three encrypted fields populated (and an optional plaintext email for filter/sort tests).
- **`describe('order PII at rest')`** — five test cases:
  - *stores no plaintext in the raw collection* — serialises the raw Mongo doc to JSON and asserts none of the fixture strings appear.
  - *round-trips through GET /orders/{id}* — full HTTP round-trip via the `api()` helper.
  - *decrypts in search results and the account export* — calls `orderService.search` and `orderService.findOwnOrders` directly.
  - *still filters and sorts on the plaintext email* — email is intentionally **not** encrypted; verifies MongoDB query/sort still works on it.
  - *refuses an order's notes copied onto another order: the order id is in the AAD* — copies raw ciphertext from one order's row into another and asserts `toJSON()` on the reloaded doc throws.

## Relationships

- **`src/modules/orders/model.ts`** — imports `orderModel`; uses `.collection.findOne` / `.collection.updateOne` to inspect raw ciphertext and to perform the cross-order copy for the AAD test.
- **`src/modules/orders/services/index.ts`** — imports `orderService`; exercises `search()` and `findOwnOrders()` as the two non-HTTP read paths that must decrypt.
- **`src/modules/orders/tests/factories.ts`** — imports `createOrder` and `toOrderItem` for document seeding.
- **`src/modules/products/tests/factories.ts`** — imports `createProduct` (an order needs at least one item).
- **`tests/support/http.ts`** — imports `api` and `authenticateAs` for the HTTP round-trip test and for obtaining a valid bearer token.
- **`tests/support/setup-test-db.ts`** — calls `setupTestDb()` at module level to isolate the test database.

## Notes

- **Email is deliberately unencrypted.** The "still filters and sorts" test documents this as a conscious design choice: addresses and notes are encrypted, but `email` remains a queryable plaintext column.
- **AAD binding is per-order-ID.** The last test shows that decryption uses the order's `_id` as Associated Authenticated Data; a ciphertext copied into a different document will fail to decrypt (throws on `toJSON()`), while the in-memory Mongoose doc that still holds the original `_id` context does not throw.
- **`setupTestDb()` is called once at module scope**, not inside each `it` block — the whole suite shares a single reset database.
