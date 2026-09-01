# src/modules/delivery/tests/contract/api.contract.test.ts

## Purpose

Contract (API-spec) tests for the three `/delivery` routes. Each test issues a real HTTP request and asserts the response both matches the OpenAPI-style spec (via `toSatisfyApiSpec`) and hits the expected status/body shape for a specific audience: public (methods list), owner (shipment read), and staff (courier advance). The file exists to pin that every contract branch is reachable over HTTP; the courier's business-logic rules are deliberately left to the unit suite.

## Key elements

- **`authenticateWithShipment()`** — local helper that creates a product, an order, transitions it to `shipped` via `orderRepository`, and calls `shipOrder`; returns the bearer token and order for use in subsequent assertions.
- **`describe('GET /delivery/methods')`** — one test: unauthenticated request returns 200 with a non-empty `methods` array, satisfying the spec.
- **`describe('GET /delivery/order/{orderId}')`** — three tests covering: 200 for the owner (tracking code prefixed `TRK-`), 404 when the order is not yet shipped, and 401 when unauthenticated.
- **`describe('POST /delivery/advance')`** — two tests: 200 for admin (reports `advanced: 1`), 403 for a regular user.

## Relationships

- **`tests/support/contract.ts`** — side-effect import (`'@tests/contract'`) that registers the `toSatisfyApiSpec` custom matcher used in every assertion.
- **`tests/support/http.ts`** — provides `api()` (HTTP client) and `authenticateAs()` (auth helper).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top-level to initialise a clean test database before any test runs.
- **`src/modules/delivery/service.ts`** — `shipOrder` is invoked in the setup helper to create the parcel that the "owner reads shipment" and "courier advance" tests depend on.
- **`src/modules/orders/index.ts`** — re-exported `orderRepository` is used to transition an order from `pending` → `shipped` during setup.
- **`src/modules/orders/repository.ts`** — the underlying `updateStatusIfIn` call made through the re-export.
- **`src/modules/products/tests/fixtures.ts`** — `createProduct` seeds a product for the order fixture.
- **`src/modules/orders/tests/fixtures.ts`** — `createOrder` and `toOrderItem` build the order used in every test scenario.

## Notes

- The file does **not** test courier ordering/sorting rules; those are explicitly deferred to the unit suite (stated in the module JSDoc).
- `setupTestDb()` is a top-level call, not wrapped in `beforeAll`; it runs once when the module is first imported.
- Every positive and negative case calls `toSatisfyApiSpec()`, meaning the spec validation is the primary assertion and the status/body checks are secondary confirmations.
- The `POST /delivery/advance` admin test relies on `authenticateWithShipment` having already created and shipped one parcel (so `advanced` equals 1); it does not clean up between the two tests in the block.
