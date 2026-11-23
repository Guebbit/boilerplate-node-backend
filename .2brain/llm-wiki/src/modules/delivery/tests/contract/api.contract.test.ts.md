---
source: src/modules/delivery/tests/contract/api.contract.test.ts
source_sha256: e48aee0d6caa46eb47bba4c9bd01497d1e533d0e762216e5536951642e2c8dda
context_sha256: 5196976a43046c3cabf05961e4cebb7ac0a5bd2cfb2c7aa979d3e9bb6795ba9f
generated_at: 2026-11-22T05:00:04.102310+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the `/delivery` HTTP API. Importing `@tests/contract` makes every response get checked against the API spec automatically. The file covers ten routes for three audiences: the public methods list, the order owner's fulfillment reads, and staff-only write operations. It checks that each contract branch is reachable over real HTTP. The detailed business rules are tested in the unit and integration suites.

## Key elements
- `setupTestDb()`: sets up the test database for the suite.
- `authenticateWithShipment()`: helper that logs in a customer whose `processing` order has already been fully shipped (tracking code `TRK-CONTRACT1`). It returns `{ bearer, order }`.
- `adminWithOrder(quantity, extras)`: helper that logs in an admin who owns a `processing` order. It returns the bearer token, the order id, the first fulfillment order id and the product id.
- `describe` blocks visible in this section:
  - `GET /delivery/methods`:
    - Works without authentication.
    - Ignores query-string filters such as `?weight=`.
    - Checks that every method is stamped with the `EUR` currency.
  - `GET /orders/{id}/fulfillment-orders` and `/shipments`:
    - Owner view, including per-item `actions`.
    - Empty `items` list for an unpaid order.
    - Staff see `holdReason`, `holdNote` and the staff actions. The buyer sees `on_hold` but never `holdNote`.
    - 404 for another customer's order or a malformed id, and 401 with no token.
  - `POST /orders/{orderId}/process`:
    - Moves a paid order to `processing` and creates its fulfillment orders.
    - Returns 409 `ORDER_NOT_PAID` for an unpaid order.
  - `POST /delivery/fulfillment-orders/{id}/shipments`:
    - Returns 201 with a `Location` header (`/delivery/shipments/{id}`) and moves the order to `shipped`.
    - Shipping only some lines leaves the order `processing` and gives `partially_fulfilled`.
    - Further cases follow (tracked method with no code yet), but are cut off in this excerpt.

## Relationships
- `@tests/contract` is imported only for its side effect, which is the automatic spec validation.
- `@tests/http` provides `api`, `authenticateAs`, `authenticateAsRole` (used with `'customer'`), `bearerForCookie` and `loginCompleting`.
- `@tests/setup-test-db` provides the DB lifecycle.
- `@tests/ids`, `@tests/cookies` and `@tests/clock` provide `MISSING_ID`, `setCookie` and `freezeDate`/`advanceDate`. Their uses fall in the part of the file not shown.
- The users, products, orders and delivery `tests/factories` files supply fixtures: admin users, products, orders with `forceOrderStatus`/`readOrder`/`toOrderItem`, and `fulfillmentOrdersOf`, `shipEverything`, `shipmentsOf`, `paidBackorderOrder` and `paidPreorderOrder`.
- `@kernel/config` provides `reauthWindowSeconds`, and `@modules/shop` provides `shopDayOf`. These imports are not used in the visible section.
- `@types` provides the `OrderStatus` enum.

## Notes
- Authorization is `Authorization: Bearer` from `authenticateAs`. Shipment creation also sets a random `Idempotency-Key` header.
- Some tests deliberately seed state through factories (such as `shipEverything`) and then verify through the HTTP API. Others make the setup calls themselves over HTTP, for example placing a hold with `POST .../hold`.
- The "empty list" test for an unpaid order shows that missing fulfillment data is returned as `{ items: [] }` with status 200, not as an error.
