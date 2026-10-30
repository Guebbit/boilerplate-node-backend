---
source: src/modules/delivery/tests/contract/api.contract.test.ts
sha256: 6443bf9eec97c1d432528937fd50905a1ed824d0a0078d9fc15ea862afdb89ef
generated_at: 2026-10-29T03:45:07.665926+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/contract/api.contract.test.ts

## Purpose

Contract tests that exercise every `/delivery` route (and related order routes) over real HTTP, with responses automatically validated against the shared spec via `@tests/contract`. They pin that each authorization branch (public, owner, staff) and each status transition is reachable and shaped correctly at the wire level, complementing the unit and integration suites that test internal logic.

## Key elements

- **`authenticateWithShipment`** – Helper that logs in a customer, creates a product + paid order, ships all 1 unit (tracking `TRK-CONTRACT1`), and returns the bearer token and order.
- **`adminWithOrder(quantity, extras)`** – Helper that logs in an admin, creates a processing order with the given quantity, and returns bearer, `orderId`, `fulfillmentOrderId`, and `productId`.
- **`GET /delivery/methods`** – Asserts the endpoint is public, ignores a leftover `?weight=` filter, and stamps every method with the shop currency (`EUR`).
- **`GET /orders/{id}/fulfillment-orders` & `/shipments`** – Verifies owner sees items with `actions` all `false`; staff see actionable flags and the `holdNote`; buyer never sees `holdNote`; another customer gets 404; no token gets 401; malformed id gets 404.
- **`POST /orders/{orderId}/process`** – Confirms 200 + `status: 'processing'` for a paid order and 409 `ORDER_NOT_PAID` otherwise.
- **`POST /delivery/fulfillment-orders/{id}/shipments`** – Checks 201 + `Location` header on full ship, partial-ship leaves order `processing` with `fulfillmentStatus: 'partially_fulfilled'`, and a tracked method without a code reports "waiting for one".

## Relationships

- **`tests/support/contract.ts`** – Imported as a side-effect (`import '@tests/contract'`); installs the global contract-validation matcher that every `expect(response.body)` is checked against.
- **`tests/support/http.ts`** – Source of `api`, `authenticateAs`, `authenticateAsRole`, `bearerForCookie`, `loginCompleting`; the HTTP client and auth helpers used by every test.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module scope to provision the test database.
- **`tests/support/ids.ts`** – Provides `MISSING_ID` for negative-path assertions.
- **`tests/support/cookies.ts`** – `setCookie` is used to simulate session cookies where needed.
- **`tests/support/clock.ts`** – `freezeDate` / `advanceDate` are imported for time-sensitive assertions (e.g. reauth windows).
- **`src/modules/delivery/tests/factories.ts`** – `shipEverything`, `fulfillmentOrdersOf`, `paidBackorderOrder`, `paidPreorderOrder`, `shipmentsOf` seed delivery-domain state.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `forceOrderStatus`, `readOrder`, `toOrderItem` build and inspect orders.
- **`src/modules/products/tests/factories.ts`** – `createProduct` creates a minimal product for order lines.
- **`src/modules/users/tests/factories.ts`** – `createAdminUser`, `PLAIN_PASSWORD` used for admin fixture setup.
- **`src/kernel/config.ts`** – `reauthWindowSeconds` imported for time-window-related assertions.
- **`src/types/index.ts`** – `OrderStatus` enum used in order creation and status assertions.

## Notes

- The `?weight=` test is intentional: the parameter was removed from the API (methods list is now an unfiltered catalogue), and this test guards against it silently reappearing.
- Hold-note visibility is a security boundary: the buyer's response must **not** contain the `holdNote` property at all (checked with `not.toHaveProperty`), not merely have it as `null`.
- `setupTestDb()` runs once at import time, not inside `beforeAll`; the test file relies on side-effect ordering.
