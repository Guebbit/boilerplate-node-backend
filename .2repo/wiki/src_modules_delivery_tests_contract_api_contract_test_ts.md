# src/modules/delivery/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the three `/delivery` HTTP routes. Each test exercises one endpoint over real HTTP and asserts the response satisfies the registered OpenAPI spec (`toSatisfyApiSpec`). The file intentionally stops at contract conformance; courier ordering/advance logic is covered by the unit suite, not here.

## Key elements

- **`authenticateWithShipment`** (local helper) — Creates a user, product, and order; updates the order to `shipped`; calls `shipOrder` to create the parcel. Returns the bearer token and order reference. Used by the shipment-read and advance tests.
- **`describe('GET /delivery/methods')`** — Single unauthenticated request; asserts 200, non-empty `methods` array, and spec conformance. Documents that rates are public pre-purchase information.
- **`describe('GET /delivery/order/{orderId}')`** — Two cases: (1) owner with a shipped order receives 200 and a `trackingCode` containing `TRK-`; (2) owner with an unshipped order receives 404. Both checked against the spec.
- **`describe('POST /delivery/advance')`** — Admin calls the tick endpoint; asserts 200 and `data.advanced === 1`.

## Relationships

- **`tests/support/contract.ts`** — Imported for side-effect only; registers the `toSatisfyApiSpec` Jest matcher used in every assertion.
- **`tests/support/http.ts`** — Provides `api()` (request builder) and `authenticateAs()` (token acquisition) used throughout.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is invoked at module top-level to reset the database before each test.
- **`src/modules/delivery/service.ts`** — `shipOrder` is called in the helper to produce the parcel that the read endpoint returns.
- **`src/modules/orders/index.ts`** / **`src/modules/orders/repository.ts`** — `orderRepository.updateStatusIfIn` transitions the order from `pending` → `shipped` before `shipOrder` is invoked.
- **`src/modules/orders/tests/fixtures.ts`** — `createOrder` and `toOrderItem` build the order fixture.
- **`src/modules/products/tests/fixtures.ts`** — `createProduct` builds the product fixture.

## Notes

- Three distinct auth levels are exercised: unauthenticated (methods), owner (shipment read), admin (advance). This mirrors the route access model and ensures the correct 401/403 contracts aren't silently skipped.
- `setupTestDb()` runs at import time (module scope), not inside `beforeEach`; the contract-support module presumably wires the per-test reset.
- The 404 "not shipped" case creates its own order without calling `shipOrder`, relying solely on the status update (or absence thereof) to drive the error path.
