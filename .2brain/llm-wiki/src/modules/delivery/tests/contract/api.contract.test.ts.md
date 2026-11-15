---
source: src/modules/delivery/tests/contract/api.contract.test.ts
sha256: c3284511a70ef811322279d1b71aa6699c97fa4f93f2465f458453728235fb2d
generated_at: 2026-11-14T19:51:32.451938+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the delivery module's ten HTTP routes, run against a real server with `setupTestDb`. Each response is automatically validated against the OpenAPI spec via the `@tests/contract` side-effect import. The file pins that every audience branch (public, owner, staff) is reachable over HTTP and returns the documented shape; business-rule correctness is deferred to unit and integration suites.

## Key elements

- **`authenticateWithShipment()`** – Helper returning a logged-in customer plus an order that already has one closed shipment (tracking `TRK-CONTRACT1`). Used to exercise the owner-read routes.
- **`adminWithOrder(quantity?, extras?)`** – Helper returning an admin bearer, the order ID, the fulfillment-order ID, and the product ID for a processing order. Used to drive staff write routes.
- **`describe('GET /delivery/methods')`** – Verifies the public catalogue: always 200, all methods listed regardless of legacy query params, every method stamped with the shop currency (`EUR`).
- **`describe('GET /orders/{id}/fulfillment-orders and /shipments')`** – Covers owner reads (items, actions, hold visibility), empty-list response for unpaid orders, staff-specific fields (`holdNote`, action flags), 404 for another customer's order, 401 without token, 404 for malformed IDs.
- **`describe('POST /orders/{orderId}/process')`** – Confirms 200 + `status: 'processing'` + fulfillment-orders created on success; 409 `ORDER_NOT_PAID` on error.
- **`describe('POST /delivery/fulfillment-orders/{id}/shipments')`** – Confirms 201 with `Location` header, full-ship vs. partial-ship (order stays `processing`, `fulfillmentStatus: 'partially_fulfilled'`), and tracked-method-without-code behaviour. (Truncated in source.)
- **`setupTestDb()`** – Called at module top-level to reset the database before the suite runs.

## Relationships

- **`tests/support/contract.ts`** – Side-effect import; auto-registers global contract assertions that validate every HTTP response against the spec.
- **`tests/support/http.ts`** – Source of `api()`, `authenticateAs()`, `authenticateAsRole()`, `bearerForCookie()`, `loginCompleting()`; all HTTP calls in this file go through these helpers.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` resets the DB so each run starts clean.
- **`tests/support/ids.ts`** – Provides `MISSING_ID` for malformed-ID cases.
- **`tests/support/clock.ts`** – `freezeDate` / `advanceDate` for time-sensitive assertions (used in truncated portion).
- **`tests/support/cookies.ts`** – `setCookie` for cookie-based auth paths.
- **`src/modules/delivery/tests/factories.ts`** – `shipEverything`, `fulfillmentOrdersOf`, `shipmentsOf`, `paidBackorderOrder`, `paidPreorderOrder` create delivery-side fixtures.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `forceOrderStatus`, `readOrder`, `toOrderItem` create and inspect orders.
- **`src/modules/products/tests/factories.ts`** – `createProduct` supplies the line-item product.
- **`src/modules/users/tests/factories.ts`** – `createAdminUser`, `PLAIN_PASSWORD` for staff auth setup.
- **`src/modules/shop/index.ts`** – `shopDayOf` for date-window logic in delivery calculations.
- **`src/kernel/config.ts`** – `reauthWindowSeconds` for re-authentication timing tests.
- **`src/types/index.ts`** – `OrderStatus` enum used throughout assertions.

## Notes

- `@tests/contract` is a **side-effect import** (no named bindings); it globally attaches spec-assertion interceptors to every `api()` call. Removing it silently disables contract validation.
- The file deliberately does **not** assert business logic (e.g., why an order can't be processed). That belongs to unit/integration tests. This file only checks shape, status code, and audience gating.
- Partial-ship responses leave the parent order in `processing` with `fulfillmentStatus: 'partially_fulfilled'`; full-ship moves it to `shipped`. Tests assert both paths.
- The `Idempotency-Key` header (random UUID) is required on shipment POSTs; omitting it is expected to trigger a 429 or 400 per the contract.
- Hold `note` is asserted **absent** on the buyer's view but **present** on the staff view — an intentional information-hiding contract, not a bug.
