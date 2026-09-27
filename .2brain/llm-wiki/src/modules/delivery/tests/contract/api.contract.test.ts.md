---
source: src/modules/delivery/tests/contract/api.contract.test.ts
sha256: 973ba7d1ff0d60b666b425abfa49f6d5a57ea04c071d2e5ec83000ebfeb81177
generated_at: 2026-09-27T14:51:37.711954+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the five `/delivery` HTTP routes across three authentication audiences (public, owner, staff). Each test asserts the response satisfies the API spec (`toSatisfyApiSpec`) and pins the correct status code and audience-level access. Business-logic rules are intentionally left to unit and integration suites; this file only verifies the wire-level contract is reachable and well-formed.

## Key elements
- **`authenticateWithShipment()`** — local helper that creates a user, product, and order, then calls `deliveryService.recordShipment` directly to seed a parcel. Returns `{ bearer, order }` for use in owner-authenticated tests.
- **`describe('GET /delivery/methods')`** — four tests: 200 + non-empty list (public), query-param resilience, `shipToCountries` payload, and `currency` stamp on every method.
- **`describe('GET /delivery/order/{orderId}')`** — two tests: 200 for the owner's shipped order, 404 error contract when the order has not shipped.
- **`describe('POST /delivery/order/{orderId}/start')`** — three tests: 200 paid→processing transition, 409 for non-paid order, 403 for a customer lacking `delivery.any.start`.
- **`describe('POST /delivery/order/{orderId}/ship')`** — three tests: 200 with tracking code, 422 when a tracked method has no code, 409 `ORDER_NOTHING_TO_SHIP` for digital-only orders.
- **`describe('POST /delivery/order/{orderId}/fulfill')`** — five tests: 200 digital-only→delivered (and confirms no parcel exists), 409 `ORDER_NOT_DIGITAL_ONLY`, 409 `ORDER_NOT_PROCESSING`, 403 for a customer, and a mutual-exclusivity check between the ship and fulfill doors.

## Relationships
- **`tests/support/contract.ts`** — side-effect import (`import '@tests/contract'`) that registers the `toSatisfyApiSpec` custom matcher used in every assertion.
- **`tests/support/http.ts`** — provides `api()` (request builder) and `authenticateAs()` (role-based bearer setup).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` called at module scope for DB isolation.
- **`tests/support/callers.ts`** — `testCallerContext` passed to `deliveryService.recordShipment` in the helper.
- **`src/modules/delivery/service.ts`** — `deliveryService.recordShipment` used to seed shipment state without going through HTTP.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem` for order fixtures.
- **`src/modules/products/tests/factories.ts`** — `createProduct` for product fixtures (physical and `requiresShipping: false`).
- **`src/modules/users/tests/factories.ts`** — `createAdminUser`, `PLAIN_PASSWORD` imported (likely used in the truncated portion).
- **`src/kernel/middlewares/authorizations.ts`** — `REAUTH_TIME_CRITICAL` imported (likely consumed in the truncated portion or as a shared constant).
- **`src/types/index.ts`** — `OrderStatus` enum for fixture status values.
- **`tests/support/cookies.ts`**, **`tests/support/clock.ts`** — `setCookie`, `freezeDate`, `advanceDate` imported for tests in the truncated section.

## Notes
- Every test terminates with `expect(response).toSatisfyApiSpec()`; the matcher is contributed by the `@tests/contract` side-effect import, not by a per-test `expect.extend`.
- `authenticateWithShipment` bypasses HTTP for shipment creation (calls the service directly) to keep setup fast; this is the only place the service is invoked without going through `api()`.
- The `GET /delivery/methods?weight=` test guards a deliberate API decision: the `weight` filter was removed, and the test ensures a stale caller param cannot silently alter the response shape.
- Error bodies expose a machine-readable `errors[0].code` (e.g. `ORDER_NOTHING_TO_SHIP`, `ORDER_NOT_DIGITAL_ONLY`, `ORDER_NOT_PROCESSING`) that the frontend can branch on.
- The test relies on `NODE_SHOP_COUNTRY=IT` and an unset `NODE_SHIP_TO_COUNTRIES`, configured in `tests/support/setup.ts`; the currency assertion hard-codes `EUR`.
