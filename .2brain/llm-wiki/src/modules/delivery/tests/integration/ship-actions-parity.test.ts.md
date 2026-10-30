---
source: src/modules/delivery/tests/integration/ship-actions-parity.test.ts
sha256: bcf1edca99865cacb19b802cc07045b1da8a2705aa180d606d7c229e5ce109ff
generated_at: 2026-10-29T03:48:29.225815+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/ship-actions-parity.test.ts

## Purpose

Integration test that asserts the `actions.ship` boolean exposed on the fulfillment-order view (the "door sign") always matches whether the `POST /delivery/fulfillment-orders/:id/shipments` endpoint (the "door itself") actually accepts the request. It sweeps every supported staff role against every order status and collects disagreements, failing if any role × status combination disagrees.

## Key elements

- **`ROLES`** – `['admin', 'manager', 'warehouse', 'support']`; the staff roles whose `start:Shipment` / `update:Shipment` permission differences are under test.
- **`STATUSES`** – `pending`, `paid`, `processing`, `cancelled`; the order statuses a shipment could be cut from or refused at.
- **`accepted(res)`** – helper that returns `true` for any 2xx HTTP status.
- **`describe('the ship action and the ship door agree')` / `it('for every role and every status')`** – the single test case. For each (status, role) pair it: creates a product + order, fetches the fulfillment order, forces the target status, reads `actions.ship` from the GET view, POSTs the ship endpoint, and compares the two booleans. Disagreements are accumulated and asserted empty.
- **`shippedFromPaid` guard** – asserts exactly 2 successful ships from `paid` (admin + warehouse), preventing a vacuous pass where *no* role can ship from `paid`.
- **`setupTestDb()` / `registerCheckoutModules([])`** – test scaffolding: fresh DB per run, no extra checkout modules registered.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/setup-test-db.ts` | `setupTestDb()` provisions the in-memory test database before the suite runs. |
| `tests/support/checkout-modules.ts` | `registerCheckoutModules([])` resets module registration in `beforeEach`. |
| `tests/support/http.ts` | `api()` builds Supertest requests; `authenticateAsRole()` returns a bearer token for a given role. |
| `src/modules/products/tests/factories.ts` | `createProduct` creates the product line-item for each order. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem` build the order; `forceOrderStatus` overrides the order to the status under test. |
| `src/modules/delivery/tests/factories.ts` | `fulfillmentOrdersOf` retrieves the fulfillment order that a paid order produces. |
| `src/types/index.ts` | `OrderStatus` enum and `FulfillmentOrder` type used for the status list and the response-body cast. |

## Notes

- Each (role, status) iteration creates a **fresh order** because the ship POST mutates state (it "writes"). Reusing an order would leak mutations across iterations.
- The test reads `actions.ship` from the **GET** response body (`/orders/:id/fulfillment-orders`), then independently exercises the **POST** ship endpoint. The two must agree; the test is the parity bridge between the action-flag computation and the authorization middleware.
- `shippedFromPaid === 2` encodes the expectation that exactly **admin** and **warehouse** hold both `start:Shipment` and `update:Shipment`; manager and support should be refused from `paid`. If a new role is added to `ROLES` with those permissions, this constant must be updated.
- The single `it` block contains the entire 4 × 4 sweep (16 iterations) in a sequential loop; there is no per-iteration isolation beyond the fresh order.
