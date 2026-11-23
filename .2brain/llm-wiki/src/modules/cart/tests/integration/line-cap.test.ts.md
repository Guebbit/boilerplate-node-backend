---
source: src/modules/cart/tests/integration/line-cap.test.ts
generated_at: 2026-11-22T04:39:51.057979+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/line-cap.test.ts

## Purpose
Integration tests for the cart line cap (`NODE_CART_MAX_LINES`). Because `GET /cart` is never paginated, the number of lines is bounded at write time. The tests check that a new product is refused once the cart is full, that a line already held is never refused, that merge and reorder report `cart_full` per line rather than failing, and that the cap holds under concurrent adds.

## Key elements
- `CAP` (3) and `withCap(body)`: run a test body with `NODE_CART_MAX_LINES` overridden to `CAP`, via `withEnvironmentOverrides`.
- `products(count)`: creates `count` products with `createProduct`.
- `add(bearer, productId)`: `POST /cart/items` with quantity 1.
- `heldIds(bearer)`: reads the `productId`s from `GET /cart`.
- `reorder(bearer, orderId)`: `POST /cart/reorder`.
- `describe('POST /cart/items at the cap')`:
  - A new product gets 409 `CART_LINE_LIMIT_REACHED` and nothing is written.
  - A line already held can still be grown (200).
  - After a line is removed, a new product is accepted.
  - A burst of 8 concurrent adds leaves exactly `CAP` lines.
- `describe('setting a quantity through the service at the cap')`: `cartService.setItemById` for a product not held returns a rejection with status 409 and code `CART_LINE_LIMIT_REACHED`.
- `describe('merge into a full cart')`: `cartService.merge` cases:
  - A new product yields `cart_full` (requested 2, resulting 0), is not added, and `CART_MERGE_REFUSED` is emitted.
  - A product already held is summed (`reason: 'summed'`) with no event emitted.
  - When there is partial room, the lines that fit are added and the rest report `cart_full`, in request order.
- `describe('POST /cart/reorder into a full cart')`:
  - If no line of the order fits, the response is 409 `CART_LINE_LIMIT_REACHED`.
  - If some fit, the response is 200 and the non-fitting lines carry `cart_full`.

## Relationships
- `../../services` (`cartService`): the cart service under test, called directly for `addItemById`, `setItemById`, `merge` and `get`.
- `../../events` (`CART_MERGE_REFUSED`) and `@kernel/events` (`onDomainEvent`, `resetDomainEvents`): the merge tests reset the event bus in `beforeEach` and subscribe to the refusal event with a mock.
- `@modules/products/tests/factories` (`createProduct`) and `@modules/orders/tests/factories` (`createOrder`, `toOrderItem`): create fixtures. The order factories are used by the reorder tests.
- `@tests/setup-test-db` (`setupTestDb`): test database lifecycle, called at module level.
- `@tests/http` (`api`, `authenticateAs`): supertest client and an authenticated user with a bearer token.
- `@tests/environment` (`withEnvironmentOverrides`): scoped env overrides for the cap.
- `@tests/callers` (`testCallerContext`): the caller context passed to `cartService.merge`.
- `@tests/response` (`asReject`): narrows a service result to a rejection so `status` and `errors` can be asserted.

## Notes
- Each case runs inside `withCap`, so the env override applies only to that case's body.
- The concurrency test asserts that the cap is enforced in the write's own filter, not by a check made beforehand.
- Merge returns per-line results (`lines`) with `requested`, `resulting` and `reason`. Reorder returns the same `lines` shape in its 200 body.
