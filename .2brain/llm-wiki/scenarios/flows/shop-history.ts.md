---
source: scenarios/flows/shop-history.ts
sha256: ff5d18d9015707d57fb89965b8210ddccb2dae20f74c335e3c84f06110a16757
generated_at: 2026-10-29T01:23:13.010560+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/shop-history.ts

## Purpose

Builds the `shop` scenario's order book by driving real API endpoints (checkout, payment, shipping, cancellation, refund, deletion) rather than inserting rows directly. Every payment, stock movement, reservation, shipment, and audit entry in the resulting dataset was produced by application code, so it stays coherent when that code changes. Runs **once per process**; `scenarios/support/demo.ts` caches the result and replays it on every subsequent restore.

## Key elements

- **`FILLER_ORDERS: FillerOrder[]`** — Ten volume orders for the anonymous customer base (seven single-line, three multi-line), drawing different rows from the combinatorial filler catalogue.
- **`CUSTOMER_ORDERS: Line[][]`** — Three large orders for the named `customer` account, mixing `SEED_PRODUCT_IDS` rows with filler rows.
- **`CARTS`** — Three abandoned carts (marcus, harper, isla) filled *last* so no subsequent checkout can empty them.
- **`plannedDemand()`** — Aggregates total quantity per product across every order and the named story rows, used to size opening stock.
- **`openEveryShelf(owner)`** — Calls `POST /inventory/levels/{id}/receive` for each product (skipping the out-of-stock subject) with `openingStockFor` + planned demand, ensuring no checkout fails mid-boot.
- **`signInCustomerBase(baseUrl)`** — Concurrent `signIn` for all filler shoppers (argon2id is the bottleneck; everything after is sequential by design).
- **`driveCatalogueEdits(owner)`** — Applies a price change and the module-contributed edits from `historyEdits()` *after* all orders, so audit rows post-date the orders.
- **`banOneCustomer(owner)`** — `POST /users/{marcus}/deactivate`, placed after marcus's orders and before sign-out.
- **`signOutEveryone(callers)`** — `DELETE /account/sessions` for every caller, preventing phantom refresh tokens in the shipped dataset.
- **`OLDEST_DAYS = 80`** — Backdating ceiling; deliberately inside the 90-day audit TTL so no order's audit trail is silently reaped.
- **`TWO_LINES_FILLER_INDEX = 126`** — Filler product index used by the `order.deliveredTwoLines` story row.
- **`FillerOrder` interface** — `{ customer, lines: [productIndex, quantity][] }`.

## Relationships

- **`scenarios/flows/actions.ts`** — Source of every mutation primitive used here: `checkout`, `checkoutAndPay`, `shipOrder`, `shipPart`, `cancelOrder`, `softDeleteOrder`, `hardDeleteProduct`, `openPayment`, `receiveStock`, `recordOfflinePayment`, `syncPayment`, `submitCard`, `requestReturn`, `deliverOrder`, `holdOrder`, `cancelRemainder`, `replaceProductImage`, and the `CARD` / `Line` types.
- **`scenarios/flows/client.ts`** — Provides `signIn` and the `Caller` type used throughout.
- **`scenarios/flows/backdate.ts`** — Provides `backdateHistory` to shift timestamps of created orders.
- **`scenarios/products.ts`** — Provides `fillerProductId`, `openingStockFor`, and `productFixtures` (the iterable catalogue).
- **`scenarios/product-ids.ts`** — Provides `SEED_PRODUCT_IDS` for the named catalogue rows.
- **`scenarios/users.ts`** — Provides `SEED_CUSTOMER_EMAILS` and `SEED_CUSTOMER_IDS`.
- **`scenarios/accounts.ts`** — Provides `seedCredentials`.
- **`scenarios/shop-modules.ts`** — Provides `historyEdits()`, letting each feature module contribute its own catalogue-edit step.
- **`src/modules/orders/services/index.ts`** — Exports `withdrawalPeriodDays` used to compute the return/refund window.
- **`src/modules/users/factories.ts`** — Exports `PLAIN_PASSWORD` for sign-in.

## Notes

- **Concurrency is intentional and narrow.** Only `signInCustomerBase` and `signOutEveryone` run in parallel; every order, shipment, and edit is sequential because narrative order is the point (e.g., you cannot cancel before shipping).
- **Demand is deliberately overstated** for named-product rows (50 × dog food, 15 × dog bed) so a shelf never hits zero three hundred requests into a boot; a shelf with spare units reads as a shop, one unit short reads as a bug.
- **The out-of-stock product (`scratchPostOutOfStock`) receives no stock receipt** — that absence *is* the fixture.
- **Carts are written last** because `POST /cart/checkout` empties the source cart; any cart written earlier would be gone by the time a user inspects the dataset.
- **`marcus` is banned *after* his orders but *before* sign-out**, preserving the session he used to place them.
- **All sessions are cleared at the end** to avoid shipping phantom refresh tokens; the sessions screen counts what it finds, so leftovers would misread as active logins.
- **`OLDEST_DAYS` (80) < audit TTL (90).** Pushing the backdate past 90 days would delete an order's audit trail via TTL reaping while the order itself persists — a self-contradictory dataset in the one screen designed to explain it.
