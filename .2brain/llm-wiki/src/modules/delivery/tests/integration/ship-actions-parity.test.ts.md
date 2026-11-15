---
source: src/modules/delivery/tests/integration/ship-actions-parity.test.ts
sha256: eea829753f4a3f504a68e175adfdd182de9885194d5bfa172728b53ebd736cb7
generated_at: 2026-11-14T19:54:47.706732+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/ship-actions-parity.test.ts

## Purpose

Integration test that verifies the `FulfillmentOrderActions.ship` boolean exposed on the fulfillment-orders view matches the actual accept/reject behaviour of the `POST /delivery/fulfillment-orders/:id/shipments` endpoint. It sweeps every combination of staff role × order status to catch drift between the action flag and the authorization logic behind the ship endpoint.

## Key elements

- **`ROLES`** – The four staff roles swept (`admin`, `manager`, `warehouse`, `support`); they differ in which of `start:Shipment` / `update:Shipment` they hold.
- **`STATUSES`** – The four order statuses a shipment might be cut from or refused at (`pending`, `paid`, `processing`, `canceled`).
- **`accepted(res)`** – Small helper returning `true` for any 2xx status code.
- **`describe` block / single `it`** – The test body. For each role × status pair it:
  1. Creates a fresh product + order (as a customer).
  2. Forces the order to the target status (or leaves it `paid`).
  3. Reads the `ship` flag from the fulfillment-orders view.
  4. POSTs to the ship endpoint with a fresh idempotency key.
  5. Records any mismatch in `disagreements`.
- **Vacuous-pass guard** – After the sweep, asserts `shippedFromPaid === 2` so the test cannot trivially pass if no role is ever allowed to ship from `paid`.

## Relationships

- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the in-memory DB before the suite runs.
- **`tests/support/checkout-modules.ts`** – `registerCheckoutModules([])` resets module registrations in `beforeEach` so no other test's registrations leak in.
- **`tests/support/http.ts`** – Provides the `api()` supertest wrapper and `authenticateAsRole()` used for every HTTP call and role login.
- **`src/modules/products/tests/factories.ts`** – `createProduct()` builds a minimal product for the order line item.
- **`src/modules/orders/tests/factories.ts`** – `createOrder()`, `forceOrderStatus()`, and `toOrderItem()` construct and mutate orders for each test case.
- **`src/modules/delivery/tests/factories.ts`** – `fulfillmentOrdersOf(orderId)` retrieves the fulfillment order(s) created by the order's payment.
- **`src/types/index.ts`** – Source of the `OrderStatus` enum and the `FulfillmentOrder` type used to cast the view response.

## Notes

- **One order per case is mandatory** because the ship endpoint mutates state (it writes a shipment). Reusing an order across iterations would let an early ship affect a later assertion.
- **Orders are created as `paid` first** so that the payment flow generates the fulfillment order; the target status is then forced onto it. This means even `pending` and `canceled` cases have a fulfillment order to ship (or refuse).
- **`paid` is a two-key gate**: shipping from `paid` requires *both* `start:Shipment` and `update:Shipment`, which is why `admin` and `warehouse` are the two expected successes (hence the `=== 2` assertion).
- Each POST includes a unique `Idempotency-Key` (`randomUUID()`) to avoid the endpoint treating repeated calls within the same sweep as retries.
- `registerCheckoutModules([])` is called with an empty array; this test does not exercise any checkout-module logic, but the reset prevents cross-test contamination.
