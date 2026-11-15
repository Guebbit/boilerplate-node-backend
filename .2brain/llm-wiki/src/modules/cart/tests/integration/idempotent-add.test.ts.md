---
source: src/modules/cart/tests/integration/idempotent-add.test.ts
sha256: 53b85815298493c0a8f73d2207027fa09dcf7d6b1564c6b0826708d200bf998b
generated_at: 2026-11-14T19:33:48.638017+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/idempotent-add.test.ts

## Purpose

Integration test verifying the idempotency contract for `POST /cart/items` and `POST /cart/reorder`: a retried request under the same `Idempotency-Key` must replay the original response (cart line grows once), while a new key must add the line again ("two clicks make two").

## Key elements

- **`add(bearer, productId, key)`** – Helper that issues `POST /cart/items` with an `Authorization` bearer token, an `Idempotency-Key` header, and a single-unit quantity body.
- **`reorder(bearer, orderId, key)`** – Helper that issues `POST /cart/reorder` with the same auth/key headers and an `orderId` body.
- **`heldOf(bearer, productId)`** – Reads `GET /cart` and returns the stored quantity for a given product (defaults to `0` if absent). Casts the untyped supertest `response.body.items` to the expected shape.
- **`describe('POST /cart/items …')`** – Two tests: (1) same key replays with `idempotent-replayed: true` header and identical body, line stays at 1; (2) a second key increments the line to 2.
- **`describe('POST /cart/reorder …')`** – Two tests: (1) same key replays, order line (qty 2) appears once; (2) a second key doubles the line to 4.

## Relationships

- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module top-level to provision and tear down the test database before any test runs.
- **`tests/support/http.ts`** – Provides the `api()` supertest wrapper and `authenticateAs(role)` to obtain a bearer token for the "user" role.
- **`tests/support/replay.ts`** – `sendTwice(fn)` invokes the request function twice in sequence, simulating a client that lost the first response and retries; returns `{ first, retry }`.
- **`src/modules/products/tests/factories.ts`** – `createProduct()` creates a minimal product record whose `_id` is used as the `productId` in cart requests.
- **`src/modules/orders/tests/factories.ts`** – `createOrder(user, items)` and `toOrderItem(product, qty)` build a prior order (with a 2-unit line) that the reorder tests then re-insert into the cart.

## Notes

- The `idempotent-replayed: 'true'` response header is the sole contract signal distinguishing a replay from a fresh 200; tests assert it explicitly rather than relying on body comparison alone (the body equality check is a secondary guard).
- `heldOf` reads the cart through the public `GET /cart` endpoint rather than hitting the DB directly, keeping the test at the HTTP boundary.
- `sendTwice` does **not** simulate a network timeout; it simply calls the same request function a second time, which is sufficient because the idempotency store is keyed by the header, not by connection state.
