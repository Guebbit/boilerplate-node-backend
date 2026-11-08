---
source: scenarios/flows/shop-history.ts
sha256: ccb2e6a38a0e191f0a8801eafcd59fd7d6f197f570fd7f9120bcb1f0c0b3d559
generated_at: 2026-11-08T02:29:47.684576+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/shop-history.ts

## Purpose

The order book for the `shop` demo scenario. Rather than inserting rows directly, it drives the application through its own HTTP endpoints (checkout, payment, shipping, cancellation, refund, deletion) so that the payments, stock movements, reservations, shipments, audit entries, and analytics events are all produced by real application code. It runs once per process; `scenarios/support/demo.ts` caches the result in memory and replays it on every restore.

## Key elements

- **`OLDEST_DAYS`** (80) — age of the oldest backdated order; kept inside the 90-day `NODE_AUDIT_RETENTION_DAYS` window so audit rows are not silently TTL-reaped.
- **`FILLER_ORDERS`** (`FillerOrder[]`) — 13 orders spread across 10 named filler shoppers; provides volume for analytics and order-list screens.
- **`CUSTOMER_ORDERS`** (`Line[][]`) — 3 large multi-line orders for the `customer` account, mixing named catalogue products with filler indices.
- **`CARTS`** — 3 abandoned carts (marcus, harper, isla), filled last via `POST /cart/items`.
- **`plannedDemand()`** — aggregates the total units every flow will buy, used to size opening stock receipts.
- **`openEveryShelf(owner)`** — calls `POST /inventory/levels/{id}/receive` for every product (except the intentional out-of-stock one) with catalogue opening stock + planned demand.
- **`signInCustomerBase(baseUrl)`** — concurrent `signIn` for all filler shoppers (argon2id is the cost hotspot).
- **`driveCatalogEdits(owner)`** — patches a price and applies module-supplied edits via `historyEdits()` so the audit trail reads as post-opening activity.
- **`banOneCustomer(owner)`** — `POST /users/{marcus}/deactivate`; runs after all orders so the session is still valid.
- **`signOutEveryone(callers)`** — `DELETE /account/sessions` for every caller to remove phantom refresh tokens from the dataset.
- **Main flow (truncated in sample)** — orchestrates checkout, payment, shipping, holds, partial shipments, cancellations, returns, image-state demos, and the two-line delivery using the action helpers from `./actions`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/accounts.ts` | Imports `seedCredentials` for auth setup. |
| `scenarios/product-ids.ts` | Imports `SEED_PRODUCT_IDS` to reference named catalogue rows. |
| `scenarios/products.ts` | Imports `fillerProductId`, `openingStockFor`, `productFixtures` to build lines and size stock. |
| `scenarios/users.ts` | Imports `SEED_CUSTOMER_EMAILS` / `SEED_CUSTOMER_IDS` for the filler shopper base. |
| `scenarios/shop-modules.ts` | Imports `historyEdits()`; each module contributes its own audit-trail edit. |
| `scenarios/flows/client.ts` | Imports `signIn` and the `Caller` type used for every authenticated request. |
| `scenarios/flows/backdate.ts` | Imports `backdateHistory` to shift order timestamps into the past. |
| `scenarios/flows/actions.ts` | Imports the full set of endpoint-level helpers (`checkout`, `checkoutAndPay`, `shipOrder`, `cancelOrder`, `softDeleteOrder`, `receiveStock`, `syncPayment`, etc.). |
| `src/modules/orders/services/index.ts` | Imports `withdrawalPeriodDays` for return-window calculations. |
| `src/modules/users/factories.ts` | Imports `PLAIN_PASSWORD` to sign in seeded accounts. |

## Notes

- **Stock before sales.** `openEveryShelf` must complete before any checkout; the catalogue seeds at `onHand: 0`, so a missing receipt is a failed checkout hundreds of requests into boot.
- **Out-of-stock product is never stocked.** `scratchPostOutOfStock` is deliberately skipped in `openEveryShelf` — that absence is the point of its catalogue entry.
- **Carts are written last.** Checkout empties the source cart, so any cart seeded before the flows would be gone by the time a user looks.
- **Sign-in is concurrent; the story is sequential.** Only the login phase parallelises (argon2id cost); all order/shipping/cancel steps run in declared order.
- **Ban runs after orders, before sign-out.** A banned account cannot reuse the session that placed its orders, so the deactivation must land while the session is still valid but after the orders exist.
- **Sign-out prevents phantom sessions.** Twelve leftover refresh tokens would appear on the sessions screen as if the customers were still logged in.
- **Named-row demand is deliberately overstated** (e.g. 50 units of dog food, 15 of the bed) so shelves settle slightly above their catalogue figure rather than one unit short.
