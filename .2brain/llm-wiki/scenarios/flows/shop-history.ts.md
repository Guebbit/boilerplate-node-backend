---
source: scenarios/flows/shop-history.ts
sha256: 27a19faa57d7de073e91a8920af411d2e2c4d160fc9cefedea22e297f7a718b5
generated_at: 2026-09-23T17:18:18.570451+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/shop-history.ts

## Purpose

Drives the application through real HTTP endpoints (`POST /cart/checkout`, `POST /payments/…`, shipping lifecycle, cancellation, refund, soft-delete) to produce a realistic shop order history. Because every row is created by the app's own code, the resulting payments, stock movements, reservations, shipments, audit entries, and analytics events are genuine and stay consistent when that code changes. Runs **once** per process; `src/app/demo.ts` keeps the result in memory and replays it on every restore.

## Key elements

- **`ShopHistory`** (exported interface) — the module's return shape: `subjects` (a `Record<string, string>` of guarantee-name → row-id, merged into `GET /__test/scenario`) and `ages` (order-id → days-back map; `0` = today, used by the two orders still holding stock).
- **`OLDEST_DAYS`** — constant `80`; deliberately inside `NODE_AUDIT_RETENTION_DAYS` (90) so no order's audit trail is silently TTL-reaped.
- **`FILLER_ORDERS`** — 13 orders (7 small, 3 medium × 2) for the filler customer base; provides VOLUME so analytics and order-list screens look like a shop.
- **`CUSTOMER_ORDERS`** — 3 large multi-line orders for the `customer` account, mixing named catalogue rows and `fillerProductId` rows.
- **`CARTS`** — 4 baskets left sitting in the shop (admin, marcus, harper, isla); filled last because `checkout` empties the source cart.
- **`plannedDemand()`** — computes total per-product demand across all orders and carts; named rows are overstated (40 dog-food, 30 dog-bed) to guarantee no checkout fails mid-boot.
- **`openEveryShelf(owner)`** — calls `POST /inventory/receipts` for every product (except `scratchPostOutOfStock`) at `openingStockFor` + planned demand, before any order is placed.
- **`signInCustomerBase(baseUrl)`** — concurrent `signIn` for all filler shoppers (bcrypt cost-12 makes serial login the runner's dominant cost).
- **`driveCatalogueEdits(owner)`** — patches a product price and an Italian locale entry so the audit trail has a realistic operator edit dated *after* the orders.
- **`banOneCustomer(owner)`** — reads then `PUT`s `marcus` with `active: false`; must run after all his orders since a banned account can't reuse its session.
- **`signOutEveryone(callers)`** — `POST /account/logout-all` for every caller so the demo dataset ships zero phantom refresh-token sessions.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/accounts.ts` | Imports `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_USER_EMAIL`, `SEED_USER_PASSWORD` for the admin and `customer` logins. |
| `scenarios/flows/client.ts` | Imports `signIn` (HTTP sign-in) and the `Caller` type used as the authenticated request handle throughout. |
| `scenarios/flows/actions.ts` | Imports all action helpers: `checkout`, `checkoutAndPay`, `submitCard`, `openPayment`, `syncPayment`, `recordOfflinePayment`, `advanceOrder`, `shipOrder`, `deliverOrder`, `cancelOrder`, `softDeleteOrder`, `receiveStock`, `hardDeleteProduct`, `replaceProductImage`, and the `CARD` / `Line` types. |
| `scenarios/products.ts` | Imports `fillerProductId`, `openingStockFor`, and `productFixtures` to compute stock receipts and resolve filler product ids. |
| `scenarios/subjects.ts` | Imports `SEED_PRODUCT_IDS` for the named catalogue rows (dog food, dog bed, out-of-stock scratch post). |
| `scenarios/users.ts` | Imports `SEED_CUSTOMER_EMAILS` and `SEED_CUSTOMER_IDS` to drive the filler shopper base and the ban. |
| `src/modules/users/factories.ts` | Imports `PLAIN_PASSWORD` (the known plaintext used for every seeded user's login). |
| `scenarios/index.ts` | Consumes this module's exported `ShopHistory` and makes it available to the demo replay. |

## Notes

- **Run-once semantics.** The module is not idempotent by design; it mutates live state through the API. `src/app/demo.ts` caches the result and replays it, so the flow body executes exactly once per process.
- **Audit retention boundary.** `OLDEST_DAYS = 80` is chosen to sit inside the 90-day audit TTL. Backdating past 90 would leave orders whose audit rows have already been reaped — a self-contradicting dataset on the one screen meant to explain it.
- **Out-of-stock product is intentionally unserviced.** `scratchPostOutOfStock` receives no inventory receipt; its existence *is* the fixture.
- **Overstated demand for named rows.** `plannedDemand` adds 40 dog-food and 30 dog-bed units as a flat budget rather than summing line-by-line, so a shelf never lands one unit short and a checkout fails three hundred requests into boot.
- **Cart fill order matters.** Carts are written last in the flow because `POST /cart/checkout` empties the source cart; any cart written before the flows ran would be gone.
- **`banOneCustomer` reads-then-writes.** `PUT /users/{id}` validates the full identity document, so the row is `GET`-read first — mirroring what the admin UI does before save.
- **`signOutEveryone` is not cleanup.** Without it, twelve build-time sessions ship as phantom refresh tokens in the demo dataset, and the frontend sessions screen would count them.
