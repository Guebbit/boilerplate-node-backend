---
source: src/modules/cart/tests/integration/idempotent-add.test.ts
source_sha256: 53b85815298493c0a8f73d2207027fa09dcf7d6b1564c6b0826708d200bf998b
context_sha256: f0c92dcbd39b27f200f05abf0f51ed8cb2a2c4776a6fc7bc9b63a4ed6234342e
generated_at: 2026-11-22T04:39:19.646333+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/idempotent-add.test.ts

## Purpose
Integration tests for `POST /cart/items` and `POST /cart/reorder` when called with an `Idempotency-Key` header. They check that a retry with the same key replays the first response and changes the cart only once. They also check that a different key counts as a new request and adds again ("two clicks make two").

## Key elements
- `add(bearer, productId, key)`: posts `{ productId, quantity: 1 }` to `/cart/items` with the `Authorization` and `Idempotency-Key` headers.
- `reorder(bearer, orderId, key)`: posts `{ orderId }` to `/cart/reorder` with the same headers.
- `heldOf(bearer, productId)`: reads `GET /cart` and returns the quantity held for the product, or `0` if the line is absent. The `items` body shape is cast, since supertest bodies are untyped.
- `describe('POST /cart/items ...')`:
  - Same key sent twice: both responses are 200, the retry has `idempotent-replayed: true` and a body equal to the first, and the cart holds 1.
  - A new key after a replayed pair: the cart holds 2.
- `describe('POST /cart/reorder ...')`:
  - Same key sent twice: both responses are 200, the retry is flagged as replayed, and the cart holds 2 (the order's quantity).
  - A new key after a replayed pair: the cart holds 4.

## Relationships
- `tests/support/setup-test-db.ts`: `setupTestDb()` is called at module level to prepare the test database.
- `tests/support/http.ts`: provides `api()` (the request client) and `authenticateAs('user')`, which returns `{ bearer, user }`.
- `tests/support/replay.ts`: `sendTwice(fn)` runs the request twice and returns `{ first, retry }`.
- `src/modules/products/tests/factories.ts`: `createProduct()` creates the product that is added to the cart.
- `src/modules/orders/tests/factories.ts`: `createOrder(user, items)` and `toOrderItem(product, quantity)` build the order used by the reorder tests.

## Notes
- Each test authenticates a fresh user and creates its own product, so tests don't share cart state.
- The "new key" tests first run `sendTwice` with the first key and then make a single call with the second key. This shows that the replay did not add twice and that the new key still adds.
- Imports use the `@tests/*` and `@modules/*` path aliases.
