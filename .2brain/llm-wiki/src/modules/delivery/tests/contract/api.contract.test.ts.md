---
source: src/modules/delivery/tests/contract/api.contract.test.ts
sha256: ee3a031b02ace84c41135f3e6ccb3eb20c904eab8ad76606929ba40736d2c91a
generated_at: 2026-09-23T18:37:47.578051+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/contract/api.contract.test.ts

## Purpose

Contract (schema) tests for the four `/delivery` HTTP routes. Each test asserts that the response matches the declared API spec (via `toSatisfyApiSpec`) for both success and error branches, across three audiences: public (methods list), owner (shipment read), and staff (ship / deliver writes). The file does **not** test business-rule logic — it pins that each contract branch is reachable over HTTP.

## Key elements

- **`authenticateWithShipment()`** — Helper that logs in a user, creates a product + order in `processing` status, then calls `deliveryService.recordShipment` so a parcel exists. Returns the bearer token and order.
- **`describe('GET /delivery/methods')`** — Verifies the public methods list (no auth) and the weight-filter branch (10 000 g excludes `express`, keeps `standard`).
- **`describe('GET /delivery/order/{orderId}')`** — Verifies owner reads their own shipment (200) and the 404 error contract when no shipment exists yet.
- **`describe('POST /delivery/order/{orderId}/ship')`** — Verifies staff shipping a `processing` order (200) and the 422 contract when a tracked method is missing its code.
- **`describe('POST /delivery/order/{orderId}/deliver')`** — Verifies staff delivering a shipped order (200) and the 409 + "order untouched" contract for forced-deliver with no parcel on file.
- **`setupTestDb()`** — Called at module load to provision an isolated test database before any test runs.

## Relationships

- **`src/modules/delivery/service.ts`** — `deliveryService.recordShipment` is invoked in test setup to create a parcel, giving the shipment-read and deliver tests a valid pre-condition.
- **`src/modules/orders/tests/factories.ts`** — Provides `createOrder`, `readOrder`, and `toOrderItem` for building order fixtures and reading back stored state.
- **`src/modules/products/tests/factories.ts`** — Provides `createProduct` to seed a line-item product.
- **`src/types/index.ts`** — Supplies the `OrderStatus` enum used in fixtures and assertions.
- **`tests/support/contract.ts`** — Side-effect import (`@tests/contract`) registers the `toSatisfyApiSpec` Jest matcher used by every assertion.
- **`tests/support/http.ts`** — Supplies the `api()` request helper and `authenticateAs` for issuing authenticated calls.
- **`tests/support/callers.ts`** — Provides `testCallerContext` passed to `recordShipment` so the service's caller-guard is satisfied during setup.
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb` to initialise/tear down the test database.

## Notes

- The `@tests/contract` import is a **side-effect** import; it registers the `toSatisfyApiSpec` matcher globally. Removing it breaks every `expect(response).toSatisfyApiSpec()` call.
- The B20 regression (documented in the inline comment) is the reason the forced-deliver test asserts the order status is _still_ `processing` after a 409 — it guards against a prior bug where `recordDelivery` mutated status before validating the shipment existed.
- Weight-filter test uses hardcoded thresholds (express ≤ 5 000 g, standard ≤ 30 000 g). If those limits change in config, this test will fail without any other code changing.
- The file explicitly scopes itself to contract shape; deeper business-logic assertions (e.g., "which statuses are eligible for ship") belong in the unit/integration suites for the delivery module.
