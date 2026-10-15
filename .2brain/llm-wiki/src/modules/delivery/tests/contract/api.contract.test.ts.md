---
source: src/modules/delivery/tests/contract/api.contract.test.ts
sha256: 11444459596400bfc4d0bc4d7802328185921a789dd8cb3516569b8fad1001a2
generated_at: 2026-10-15T10:28:37.636613+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/delivery` API surface over real HTTP. Every response is automatically validated against the API spec via the `@tests/contract` side-effect import. The file pins that each contract branch (status codes, body shape, error codes, audience-specific fields) is actually reached over the wire, for three audiences: public (methods catalogue), the order owner (fulfilment read), and staff (all write operations).

## Key elements

- **`setupTestDb()`** — bootstraps a clean test database before the suite runs.
- **`authenticateWithShipment()`** — helper that logs in a user, creates a product + order, ships it, and returns the bearer token and order. Used for owner-reading scenarios.
- **`adminWithOrder(quantity, extras)`** — helper that logs in an admin, creates a product, a processing order (optionally with a specific `shippingMethod`), and returns bearer, `orderId`, `fulfillmentOrderId`, `productId`. Used for staff write scenarios.
- **`describe('GET /delivery/methods')`** — four tests: unauthenticated 200, ignored `?weight=` query param, `shipToCountries` reflects `NODE_SHOP_COUNTRY`, every method carries the shop currency.
- **`describe('GET /delivery/order/{orderId}')`** — four tests: owner sees both lists with restricted actions; unpaid order returns empty lists; staff sees `hold`/`release` actions and `holdNote`; another customer's order returns 404.
- **`describe('POST /delivery/order/{orderId}/start')`** — three tests: admin starts a paid order (200, fulfillment orders created); non-paid order → 409; customer without `delivery.any.start` → 403.
- **`describe('POST /delivery/fulfillment-orders/{id}/shipments')`** — five visible tests: full ship (201 + `Location` header, order → shipped); partial ship (order stays processing, `partially_fulfilled`); missing tracking code on express → 422 `DELIVERY_TRACKING_CODE_REQUIRED`; over-quantity lines → 422 `DELIVERY_LINES_INVALID`; digital fulfillment order rejection (truncated).

## Relationships

- **`@tests/contract` (tests/support/contract.ts)** — side-effect import that registers a global response interceptor to validate every `api()` call against the OpenAPI/contract spec. The backbone of this file.
- **`@tests/setup-test-db.ts`** — resets and seeds a test database before each run.
- **`@tests/http.ts`** — provides `api()`, `authenticateAs`, `authenticateAsRole`, `bearerForCookie`; the actual HTTP client used for every request.
- **`@tests/cookies.ts`** — `setCookie` for session-based auth where applicable.
- **`@tests/clock.ts`** — `freezeDate` / `advanceDate` for time-dependent assertions (e.g., reauth windows).
- **`@tests/ids.ts`** — `MISSING_ID` for negative-path tests.
- **`@modules/users/tests/factories.ts`** — `createAdminUser`, `PLAIN_PASSWORD` for provisioning admin accounts.
- **`@modules/products/tests/factories.ts`** — `createProduct` for seeding purchasable items.
- **`@modules/orders/tests/factories.ts`** — `createOrder`, `readOrder`, `toOrderItem` for order fixtures.
- **`@modules/delivery/tests/factories.ts`** — `fulfillmentOrdersOf`, `paidPreorderOrder`, `shipEverything`, `shipmentsOf` for delivery-domain fixtures.
- **`@kernel/config.ts`** — `reauthWindowSeconds` (imported, likely used in a truncated section).
- **`@types/index.ts`** — `OrderStatus` enum for order-state assertions.

## Notes

- The `@tests/contract` import is a **side-effect** module: it wraps the HTTP client so every response is auto-asserted against the spec. No explicit `expect(response).toMatchContract(...)` calls appear; the interceptor handles it.
- The `?weight=` test documents a **deliberate API change**: weight-based filtering was removed from the methods endpoint. The test guards against silently re-introducing a filter.
- `shipToCountries` and per-method `currency` are asserted from environment variables (`NODE_SHOP_COUNTRY=IT`, currency `EUR`) set in `tests/support/setup-environment.ts` — these are deployment-level config, not per-request values.
- The 404-for-foreign-order test (not 403) is a contract choice: the owner endpoint hides existence of other users' orders.
- File is truncated in the source; the digital-fulfillment-order test and any remaining routes are not visible.
