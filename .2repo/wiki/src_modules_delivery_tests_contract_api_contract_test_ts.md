# src/modules/delivery/tests/contract/api.contract.test.ts

## Purpose

Contract tests that pin the HTTP-level shape and status codes of the three `/delivery` routes (methods list, owner shipment read, courier advance tick). They verify each authorization branch (public, owner, staff) is reachable over real HTTP and that responses conform to the OpenAPI spec. Business logic like courier ordering rules is deliberately left to the unit suite.

## Key elements

- **`authenticateWithShipment()`** — Helper that authenticates a user, creates a product and a single-item order, marks the order `shipped`, calls `shipOrder`, and returns the bearer token plus the order. Reused by the shipment-read and advance tests.
- **`describe('GET /delivery/methods')`** — One unauthenticated call asserting 200, a non-empty methods array, and spec conformance.
- **`describe('GET /delivery/order/{orderId}')`** — Three cases: owner reads their own shipment (200, tracking code present), owner reads an unshipped order (404), unauthenticated call (401). Each asserts spec conformance.
- **`describe('POST /delivery/advance')`** — Admin advances and receives `advanced: 1` (200); a non-admin is rejected with 403. Each asserts spec conformance.

## Relationships

- **`tests/support/contract.ts`** — Provides the `toSatisfyApiSpec()` matcher used on every assertion to validate the response against the OpenAPI contract.
- **`tests/support/http.ts`** — Provides `api()` (request builder) and `authenticateAs()` (role-based auth token helper).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top level to prepare a clean in-memory database before tests run.
- **`src/modules/delivery/service.ts`** — `shipOrder()` is called to transition a pending order into the shipped state so the shipment-read and advance tests have realistic fixtures.
- **`src/modules/orders/index.ts`** — Exports `orderRepository`, used here to call `updateStatusIfIn` and move an order from `pending` to `shipped` before invoking `shipOrder`.
- **`src/modules/orders/repository.ts`** — Underlying repository behind the `orderRepository` import; the test relies on its `updateStatusIfIn` guard to ensure only `pending` orders transition.
- **`src/modules/orders/tests/factory.ts`** — `createOrder` and `toOrderItem` build the order fixture.
- **`src/modules/products/tests/factory.ts`** — `createProduct` builds the product fixture consumed by the order.

## Notes

- The test for `GET /delivery/methods` intentionally sends **no** auth header; this is the only endpoint in the suite that is public.
- `authenticateWithShipment` performs the full pipeline (create product → create order → status update → `shipOrder`) in one call. If `shipOrder`'s preconditions change, this helper (not the individual tests) is where to adjust.
- The advance test calls `authenticateWithShipment` first *without* keeping its user token, then authenticates separately as `admin`. The shipment is tied to the original user's order, not the admin's.
- Backtick characters appear in a few string literals (`caller\``, `staff\``) — these are display artifacts; treat them as plain apostrophes.
