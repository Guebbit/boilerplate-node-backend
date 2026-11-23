---
source: src/modules/delivery/tests/integration/ship-actions-parity.test.ts
source_sha256: e83486c75cf5d16c55f7f0fa42cb89b8567220f95b468d3c1e0f628be1e6ba76
context_sha256: d8705c701ba662bc67bb9796b66504d913989ad496d67a112807a2723cd46034
generated_at: 2026-11-22T05:03:33.277238+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/integration/ship-actions-parity.test.ts

## Purpose
Integration test that checks the `ship` flag in `FulfillmentOrderActions` (returned by the fulfillment-orders view) matches what the ship endpoint actually accepts. It sweeps every staff role against every order status and requires the two to agree in every case. It exists to stop the advertised action and the real permission check from drifting apart.

## Key elements
- `ROLES`: `admin`, `manager`, `warehouse` and `support`. These are staff roles that differ in `update:Shipment` and `start:Shipment`.
- `STATUSES`: `pending`, `paid`, `processing` and `canceled` from `OrderStatus`.
- `accepted(response)`: returns true for a 2xx HTTP status.
- The single test, `for every role and every status`:
  - Signs in a `customer` as order owner, plus one session per role.
  - For each status × role pair, creates a fresh product and a `paid` order, and reads its fulfillment order.
  - If the status under test is not `paid`, forces that status onto the order.
  - Reads `GET /orders/:id/fulfillment-orders` as the staff user and takes `items[0].actions.ship`, defaulting to `false`.
  - Sends `POST /delivery/fulfillment-orders/:id/shipments` with a random `Idempotency-Key` and an empty body.
  - Collects a `disagreements` entry whenever the ship result differs from the flag.
  - Asserts `disagreements` is empty and that exactly 2 ships succeeded from `paid`.

## Relationships
- `@tests/setup-test-db` (`setupTestDb`): sets up the test database.
- `@tests/checkout-modules` (`registerCheckoutModules`): called with `[]` in `beforeEach`.
- `@tests/http` (`api`, `authenticateAsRole`): HTTP client and role-based authentication (`.bearer`, `.user`).
- `@modules/products/tests/factories` (`createProduct`): creates products.
- `@modules/orders/tests/factories` (`createOrder`, `forceOrderStatus`, `toOrderItem`): builds paid orders and overrides their status.
- `@modules/delivery/tests/factories` (`fulfillmentOrdersOf`): fetches the fulfillment orders the payment created.
- `@types`: supplies `OrderStatus` and the `FulfillmentOrder` type.

## Notes
- Each case builds its own order because the ship endpoint writes.
- Shipping from `paid` needs both `start:Shipment` and `update:Shipment`.
- `pending` and `canceled` orders still carry a fulfillment order, because the order is created as `paid` and the status is forced afterwards.
- The final `shippedFromPaid` check of 2 (admin and warehouse) guards against a vacuous pass, where nothing ships and both sides trivially agree.
