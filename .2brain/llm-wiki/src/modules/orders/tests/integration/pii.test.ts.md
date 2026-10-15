---
source: src/modules/orders/tests/integration/pii.test.ts
sha256: d1f42e4b0e10d30021a50d5d7ee347e4f9e5a45c8f244df534b7d28a6b2484ce
generated_at: 2026-10-15T11:16:03.178141+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/pii.test.ts

## Purpose

Integration tests verifying that order PII (shipping address, billing address, notes) is encrypted at rest, decrypts correctly on every read path (route, search, account export), and is cryptographically bound to its owning order via AAD so it cannot be decrypted on a different order.

## Key elements

- **`SHIPPING` / `BILLING` / `NOTES`** – Fixture constants holding the plaintext values written into the encrypted fields.
- **`seedPiiOrder(user, email?)`** – Helper that creates a product and an order with all three encrypted fields (plus optional plaintext `email`) populated.
- **`describe('order PII at rest')`** – Suite containing five cases:
  - *No plaintext in raw collection* – serialises the raw Mongoose document and asserts none of the fixture strings appear.
  - *Round-trips through GET /orders/{id}* – confirms the HTTP route returns decrypted values.
  - *Decrypts in search and account export* – exercises `orderService.search` and `findOwnOrders`.
  - *Still filters and sorts on the plaintext email* – verifies `email` is deliberately left unencrypted for queryability.
  - *AAD binding* – copies an encrypted `notes` blob from order A to order B at the collection level; asserts that `toJSON()` on the reloaded document **throws**.

## Relationships

- **`../../model` (`orderModel`)** – used to inspect the raw collection (`collection.findOne`) and to reload a document after the AAD tampering step.
- **`../../services` (`orderService`, `findOwnOrders`)** – exercised for the search, owner-scoped search, and export read paths.
- **`../../tests/factories.ts` (`createOrder`, `toOrderItem`)** – builds the test order and its line-item.
- **`../../../products/tests/factories.ts` (`createProduct`)** – supplies the product referenced by the order item.
- **`@tests/http` (`api`, `authenticateAs`)** – provides the authenticated HTTP client and a fresh test user.
- **`@tests/setup-test-db` (`setupTestDb`)** – initialises the in-memory / temporary database before the suite runs.

## Notes

- **AAD is the order's `_id`.** The final test is the only one that intentionally corrupts state at the collection level; it proves the decryption key derivation includes the order identifier, not just a shared service key.
- **`email` is plaintext by design.** The filtering/sorting test makes this contract explicit—if a future change encrypts `email`, the `orderService.search({ email })` and `sort: ['email']` assertions will break.
- The test reaches into `orderModel.collection` (the underlying Mongoose collection) to read raw BSON, bypassing any schema-level decryption hooks. Do not replicate this pattern in production code.
