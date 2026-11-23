---
source: scenarios/flows/shop-history.ts
source_sha256: 5fc808d7021f77829999a20bf80db93ab8ceb56af62f9ec27455ad98f0f055e8
context_sha256: ff65b528bb2a5eff7f56076d71b19422463d95e6c2153ceb56c7b46f3e68e8e1
generated_at: 2026-11-22T01:43:35.526522+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/flows/shop-history.ts

## Purpose
Builds the `shop` demo scenario's order book by driving the running application through its real HTTP endpoints (checkout, payment, shipping lifecycle, cancel/refund/delete) instead of inserting database rows. Payments, stock movements, reservations, shipments, audit entries and analytics events are therefore produced by the real code. It runs once per process; `scenarios/support/demo.ts` keeps the result in memory and replays it on each restore.

## Key elements
- `OLDEST_DAYS` (80): age of the oldest order. It is kept inside `NODE_AUDIT_RETENTION_DAYS` (180) so the TTL-reaped audit trail doesn't lose the history of backdated orders.
- `FillerOrder` / `FILLER_ORDERS`: 13 small and medium orders from the seeded shoppers (amelia, benjamin, chloe, daniel, grace, felix, priya, marcus, harper, isla). They exist to add volume to the analytics and order-list screens. Lines are `[productIndex, quantity]` pairs into the filler catalogue.
- `CUSTOMER_ORDERS`: three large orders for the `customer` account. They mix named catalogue products (dog food, dog bed) with filler products.
- `CARTS`: baskets left unpurchased for marcus, harper and isla. They are filled last through `POST /cart/items`, because a checkout empties the cart.
- `DOG_FOOD(quantity)`: helper returning a single dog-food line.
- `TWO_LINES_FILLER_INDEX` (126): the filler product bought by `order.deliveredTwoLines`.
- `plannedDemand()`: totals every unit the flows will buy. Named-row demand is deliberately overstated (50 dog food, 15 dog beds). Filler indexes 121–125 and 126 are also counted.
- `openEveryShelf(owner)`: receives opening stock plus planned demand for each product via `receiveStock`. It skips `scratchPostOutOfStock`, which gets no receipt.
- `signInCustomerBase(baseUrl)`: signs in all seeded customers concurrently, because argon2id logins are slow. It returns a `Map` of callers by key.
- `driveCatalogEdits(owner)`: patches the dog food price to `71.00`, then runs each edit from `historyEdits()` in `shop-modules.ts`.
- `banOneCustomer(owner)`: `POST /users/{marcus}/deactivate`.
- `signOutEveryone(callers)`: `DELETE /account/sessions` for each caller, so no phantom refresh-token sessions ship in the dataset.
- Imports from `./actions` (checkout, payment, shipping, cancel, return, delete, image-replace helpers, etc.) provide the building blocks the flows use. The rest of the file, which defines the flows themselves, is not shown here.

## Relationships
- `./client`: provides `signIn` and the `Caller` type used for every authenticated request.
- `./actions`: provides the action helpers (`checkout`, `checkoutAndPay`, `shipOrder`, `receiveStock`, `softDeleteOrder`, etc.).
- `./backdate`: `backdateHistory` is imported to date the generated history.
- `../product-ids`, `../products`: supply `SEED_PRODUCT_IDS`, `fillerProductId`, `openingStockFor` and `productFixtures`.
- `../users`: supplies `SEED_CUSTOMER_EMAILS` and `SEED_CUSTOMER_IDS`.
- `../shop-modules`: supplies `historyEdits()`, so each module contributes its own audit-trail edit.
- `@scenarios/accounts`: supplies `seedCredentials`.
- `@modules/orders/services`: supplies `withdrawalPeriodDays`.
- `@modules/users/factories`: supplies `PLAIN_PASSWORD` for customer logins.

## Notes
- Ordering matters. Stock is received before any purchase, catalogue edits come after all orders, carts are filled after all checkouts, and the ban comes after every shopper has signed out, since a banned account's session stops working.
- Shelves are intentionally stocked above the figure in `scenarios/products.ts`, so a shortage never fails a checkout during boot.
- Staff and administrators never get carts.
