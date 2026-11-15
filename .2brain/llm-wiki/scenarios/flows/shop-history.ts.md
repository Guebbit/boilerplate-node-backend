---
source: scenarios/flows/shop-history.ts
sha256: 14c7ade9ed267c6cca284dc79da53252a78c044dcc209d125972daa6821d25c8
generated_at: 2026-11-14T17:16:03.471548+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/shop-history.ts

## Purpose

The order book for the `shop` demo scenario. Rather than inserting rows directly, it drives the application through its real endpoints (checkout, payment, shipping, cancellation, refund) so that every payment, stock movement, reservation, shipment, audit entry, and analytics event is produced by the actual code paths. The result is built once per process; `scenarios/support/demo.ts` caches it in memory and replays on every subsequent restore.

## Key elements

- **`OLDEST_DAYS` (80)** — age of the oldest order, deliberately inside the 180-day `NODE_AUDIT_RETENTION_DAYS` window so the audit trail is not TTL-reaped out from under the order.
- **`FillerOrder` / `FILLER_ORDERS`** — 13 modest orders spread across seven "small" and three "medium" filler shoppers; provides volume for analytics and order-list screens.
- **`CUSTOMER_ORDERS`** — three larger orders (mix of named catalogue rows and filler products) belonging to the `customer` account.
- **`CARTS`** — three abandoned carts (marcus, harper, isla) added via `POST /cart/items` *after* all checkout flows so they survive.
- **`plannedDemand()`** — aggregates every line every flow will buy into a `Map<productId, quantity>` used to size opening stock.
- **`openEveryShelf(owner)`** — calls `POST /inventory/levels/{id}/receive` for every product (except the intentional out-of-stock one) with `openingStockFor(id)` + planned demand, so shelves are never negative.
- **`signInCustomerBase(baseUrl)`** — signs in all filler shoppers concurrently (argon2id is expensive); everything after is sequential.
- **`driveCatalogEdits(owner)`** — applies a price change to the dog-food product and then iterates `historyEdits()` from `shop-modules.ts` so each module owns its own audit row.
- **`banOneCustomer(owner)`** — `POST /users/{marcus}/deactivate`, run last because a banned account cannot use its own session.
- **`signOutEveryone(callers)`** — `DELETE /account/sessions` for every caller to avoid shipping phantom refresh-token sessions in the demo dataset.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/accounts.ts` | Imports `seedCredentials` (unused in visible portion, likely for owner auth). |
| `scenarios/product-ids.ts` | Imports `SEED_PRODUCT_IDS` for named catalogue rows (dog food, dog bed, out-of-stock scratch post). |
| `scenarios/products.ts` | Imports `fillerProductId`, `openingStockFor`, `productFixtures` to resolve filler products and size stock receipts. |
| `scenarios/users.ts` | Imports `SEED_CUSTOMER_EMAILS` and `SEED_CUSTOMER_IDS` for the filler shopper set and the `customer`/`marcus` accounts. |
| `scenarios/shop-modules.ts` | Imports `historyEdits()` so each module contributes its own audit-trail edit without coupling to this file. |
| `scenarios/flows/client.ts` | Imports `signIn` and the `Caller` type used for every authenticated request. |
| `scenarios/flows/backdate.ts` | Imports `backdateHistory` to shift order timestamps into the past. |
| `scenarios/flows/actions.ts` | Primary action library: `checkout`, `checkoutAndPay`, `shipOrder`, `shipPart`, `cancelOrder`, `requestReturn`, `receiveStock`, `softDeleteOrder`, `hardDeleteProduct`, `replaceProductImage`, `recordOfflinePayment`, `syncPayment`, `openPayment`, `submitCard`, `holdOrder`, `cancelRemainder`, `deliverOrder`, `startProcessing`, and the `CARD` / `Line` types. |
| `src/modules/orders/services/index.ts` | Imports `withdrawalPeriodDays` for return-window logic. |
| `src/modules/users/factories.ts` | Imports `PLAIN_PASSWORD` (the known seed password) for sign-in. |

## Notes

- **Runs once, cached.** The module is not idempotent; it is a one-shot driver. Re-running in the same process is handled by the demo-profile layer, not by this file.
- **Stock must precede orders.** The catalogue seeds at `onHand: 0`; `openEveryShelf` is called before any checkout so the shelf can cover the full planned demand. The out-of-stock product is explicitly excluded.
- **Order of operations is deliberate and sequential.** Carts are filled last (checkout empties the originating cart). `marcus` is banned last (a deactivated account cannot use its session). Sign-out is last of all (avoids phantom sessions).
- **Concurrent sign-in, serial story.** Only the initial `signInCustomerBase` call is parallel; every subsequent step is awaited in order because the narrative sequence is the point.
- **`shop-modules.ts` decoupling.** Audit-trail edits from feature modules are supplied through `historyEdits()` rather than hard-coded here, so removing a module removes its step atomically.
- **File is truncated in the source snapshot.** The visible content ends mid-function; the full file likely contains the named-row flows (dog-food orders, partial shipments, refunds, image-state demos, remainder cancellation, etc.) and a top-level orchestrator that sequences the steps above.
