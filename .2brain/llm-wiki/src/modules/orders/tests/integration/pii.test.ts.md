---
source: src/modules/orders/tests/integration/pii.test.ts
source_sha256: 531ae80d0553cc0620b165d5bef2f994e74a61705aac6f6c3b127ead1d661ee5
context_sha256: 7332cc7a5f949f51a33bbf37610082f1a5ba85fe5ec646ef9749a50e26c66da6
generated_at: 2026-11-22T06:31:03.760096+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/pii.test.ts

## Purpose
Integration test suite verifying that an order's PII (shipping address, billing address, notes) is encrypted at rest and correctly decrypted on every read path: the HTTP route, service search, and the account export. It also checks that an encrypted value copied to a different order does not decrypt.

## Key elements
- `setupTestDb()` – called at module level to prepare the test database.
- `SHIPPING`, `BILLING`, `NOTES` – fixture constants with every PII field populated (billing includes `vatNumber`).
- `seedPiiOrder(user, email?)` – creates a product and an order with all encrypted fields set, optionally with a custom `email`.
- `describe('order PII at rest')` with five tests:
  - **No plaintext in raw collection** – serializes the raw stored document and asserts none of the sample plaintext strings appear.
  - **Round-trip via `GET /orders/{id}`** – authenticated request returns decrypted shipping, billing and notes.
  - **Search and export** – the order service's search (with `ownerScope`) and `findOwnOrders` return decrypted values.
  - **Plaintext email** – `email` remains filterable and sortable via the order service's search.
  - **AAD binding** – notes ciphertext copied from one order to another via a raw update does not throw on the in-memory document's `toJSON()`, but `toJSON()` on a freshly reloaded document throws, because the order id is part of the AAD.

## Relationships
- `src/modules/orders/model.ts` – `orderModel` is used for raw collection access and `findById` to reload documents.
- `src/modules/orders/services/index.ts` – `orderService` (`search`, `ownerScope`, `findOwnOrders`) is exercised.
- `src/modules/orders/tests/factories.ts` – `createOrder` and `toOrderItem` build the seeded orders.
- `src/modules/products/tests/factories.ts` – `createProduct` provides the order's item.
- `tests/support/http.ts` – `api()` and `authenticateAs('user')` provide the HTTP client and authenticated user/bearer token.
- `tests/support/setup-test-db.ts` – `setupTestDb` sets up the database lifecycle.

## Notes
- `email` is deliberately not encrypted, so filtering and sorting on it still work.
- The AAD test relies on reloading from the database: the already-loaded `second` document still holds the original plaintext, so only the reloaded `findById` result exposes the decryption failure.
