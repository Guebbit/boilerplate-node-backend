---
source: src/modules/cart/tests/integration/line-cap.test.ts
sha256: f2edf02c6ff749d5ffdbf80784f173bf1142322d154a6306fe3ecb7acee4b841
generated_at: 2026-11-14T19:34:20.215945+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/line-cap.test.ts

## Purpose

Integration tests for the cart line cap (`NODE_CART_MAX_LINES`). Verifies that `GET /cart` is never paginated and that the cap is enforced at write time: a new product is refused once the cart is full, an existing line can still grow, and merge/reorder report `cart_full` per line rather than failing wholesale. Because the cap lives in the write's own filter, these tests also assert it holds under concurrent adds.

## Key elements

- **`CAP`** — cap value fixed at 3 to keep each case fast (no need to write a hundred lines).
- **`withCap(body)`** — wraps a test body with `NODE_CART_MAX_LINES` set to `CAP` via environment override.
- **`products(count)`** — creates `count` fresh products via the products test factory.
- **`add(bearer, productId)`** — convenience wrapper for `POST /cart/items`.
- **`heldIds(bearer)`** — reads `GET /cart` and returns the list of product IDs in the caller's cart.
- **`reorder(bearer, orderId)`** — convenience wrapper for `POST /cart/reorder`.
- **`describe('POST /cart/items at the cap')`** — HTTP-level: 409 + `CART_LINE_LIMIT_REACHED` for a new product; 200 for growing an existing line; 200 after a line is removed; concurrent burst never exceeds the cap.
- **`describe('setting a quantity through the service at the cap')`** — exercises the service's `setItemById` directly; asserts the same 409 / error-code contract at the service boundary.
- **`describe('merge into a full cart')`** — exercises the service's merge operation; asserts per-line `reason: 'cart_full'` in the response, that the cart size is unchanged for refused lines, that existing lines are summed (`reason: 'summed'`), and that a `CART_MERGE_REFUSED` domain event is emitted (spied via `onDomainEvent`).
- **`describe('POST /cart/reorder into a full cart')`** — 409 when no line of the order fits; 200 with mixed `undefined` / `'cart_full'` reasons when only some lines fit.

## Relationships

- **`tests/support/setup-test-db.ts`** — calls `setupTestDb()` once at module load to provision an isolated database.
- **`tests/support/http.ts`** — provides `api()` (supertest instance) and `authenticateAs()` used by every HTTP test.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` injects `NODE_CART_MAX_LINES` per test.
- **`tests/support/callers.ts`** — supplies `testCallerContext` passed as an argument to the service's merge call.
- **`tests/support/response.ts`** — `asReject` narrows a `Result`-shaped service return to its error side for assertions.
- **`src/modules/products/tests/factories.ts`** — `createProduct` creates real product rows to reference in cart items.
- **`src/modules/orders/tests/factories.ts`** — `createOrder` / `toOrderItem` build an order whose lines are fed to the reorder endpoint.
- **`src/modules/cart/services/index.ts`** — imports `cartService`; used for the service-level quantity test and the merge tests.
- **`src/modules/cart/events.ts`** — imports `CART_MERGE_REFUSED`, the domain-event name subscribed to for the merge-refusal assertion.
- **`src/kernel/events.ts`** — imports `onDomainEvent` / `resetDomainEvents` to wire and clean up the domain-event spy.

## Notes

- The cap is set via **environment-variable override**, not by mutating a config object, so each test runs in isolation.
- The "burst of adds" test (`Promise.all` of 8 adds) is the concurrency guard: the cap must be enforced inside the write filter, not by a pre-check, for it to pass.
- Existing lines **bypass** the cap entirely (the "still grows a line" test); the cap counts *distinct* lines, not total quantity.
- Merge refusals are **per-line** (`cart_full` in the `lines` array) and also emit a `CART_MERGE_REFUSED` domain event; the HTTP response for reorder, by contrast, returns either a flat 409 (no lines fit) or 200 with per-line reasons.
- `heldIds` casts `response.body.items` because supertest bodies are untyped; the cart contract guarantees an `items` array with `productId`.
