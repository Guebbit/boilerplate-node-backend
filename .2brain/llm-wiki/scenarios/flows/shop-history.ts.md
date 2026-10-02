---
source: scenarios/flows/shop-history.ts
sha256: f052e575fa4b17f6e44effbe88dbe18b502d56865457b2d3300d3e7a2045e4ca
generated_at: 2026-10-01T12:21:50.453353+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/shop-history.ts

## Purpose

Drives the application's HTTP endpoints (checkout, payment, shipping, cancellation, deletion) to build a realistic order history for the demo dataset — rather than inserting rows directly. Because every order is placed, paid, and shipped through real application code, the resulting payments, stock movements, reservations, shipments, audit entries, and analytics events are internally consistent and survive code changes. Runs **once per process**; `src/app/demo.ts` caches the result in memory and replays it on every subsequent restore.

## Key elements

- **`ShopHistory`** (exported interface) — the shape returned by the flow: `subjects` (a `Record<string, string>` of guarantee-name → row-id, merged into `GET /__test/scenario`) and `ages` (order-id → days-back, used to backdate every row an order produced).
- **`OLDEST_DAYS`** (const, 80) — maximum backdating, deliberately kept inside the 90-day `NODE_AUDIT_RETENTION_DAYS` window so the audit trail is not TTL-reaped out from under its own orders.
- **`FillerOrder`** (interface) — `{ customer, lines: [productIndex, quantity][] }` for a single filler shopper.
- **`FILLER_ORDERS`** (const array, 13 entries) — volume orders across 10 filler customers so analytics and order-list screens look like a shop.
- **`CUSTOMER_ORDERS`** (const array, 3 entries) — larger, mixed named/filler orders for the primary `customer` account.
- **`CARTS`** (const array, 4 entries) — baskets left in the shop after all flows complete; only 4 customers have one (absence = never shopped).
- **`plannedDemand()`** — sums every line across all orders into a `Map<productId, quantity>` so `openEveryShelf` can stock enough inventory.
- **`openEveryShelf(owner)`** — receives stock via `POST /inventory/receipts` for every product (except the intentionally out-of-stock one) before any order is placed.
- **`signInCustomerBase(baseUrl)`** — signs in all filler shoppers concurrently (bcrypt cost-12 makes serial login the runner's dominant cost).
- **`driveCatalogueEdits(owner)`** — patches a price and runs each module's `historyEdits()` step *after* all orders, so audit rows are dated after the orders they sit among.
- **`banOneCustomer(owner)`** — `PATCH /users/:id` with `{ active: false }` for marcus; run last because he placed orders with that session.
- **`signOutEveryone(callers)`** — `POST /account/logout-all` for every caller to avoid shipping phantom refresh tokens in the dataset.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/flows/actions.ts` | Imports every HTTP action primitive: `checkout`, `checkoutAndPay`, `shipOrder`, `deliverOrder`, `cancelOrder`, `startProcessing`, `submitCard`, `openPayment`, `syncPayment`, `recordOfflinePayment`, `receiveStock`, `softDeleteOrder`, `hardDeleteProduct`, `replaceProductImage`, plus the `CARD` fixture and `Line` type. |
| `scenarios/flows/client.ts` | Imports `signIn` and the `Caller` type (the authenticated HTTP client used for every request in this flow). |
| `scenarios/subjects.ts` | Imports `SEED_PRODUCT_IDS` to reference named catalogue products (dog food, dog bed, scratch post, etc.). |
| `scenarios/products.ts` | Imports `productFixtures`, `fillerProductId`, and `openingStockFor` to enumerate the catalogue and compute stock quantities. |
| `scenarios/users.ts` | Imports `SEED_CUSTOMER_EMAILS` and `SEED_CUSTOMER_IDS` for the filler shopper identities. |
| `scenarios/accounts.ts` | Imports admin and customer credentials (`SEED_ADMIN_EMAIL/PASSWORD`, `SEED_USER_EMAIL/PASSWORD`). |
| `scenarios/shop-modules.ts` | Imports `historyEdits()` — each shop module contributes its own catalogue edit step so deleting a module removes its audit step. |
| `src/modules/users/factories.ts` | Imports `PLAIN_PASSWORD` (the password shared by all seeded users) for sign-in. |
| `scenarios/index.ts` | Consumes this flow's result as part of the full scenario orchestration. |

## Notes

- **Execution order is load-bearing.** Carts are filled *last* because checkout empties the source cart. The ban is last because marcus's session must still be active for his earlier orders. Sign-out is last to avoid shipping refresh tokens. Catalogue edits run after all orders so audit timestamps are not earlier than the orders they document.
- **Serial vs. concurrent.** Only the initial sign-in fan-out is concurrent; every order, payment, and lifecycle step after that runs in sequence. The story's ordering is the point.
- **Stock is overstated for named rows.** `plannedDemand` adds a flat 40 units of dog food and 30 of dog bed rather than counting exact lines, so a shelf is never one unit short mid-flow.
- **`PATCH`, not `PUT`, for the ban.** A `PUT` would replace the entire user document and clear avatar, locale, phone, and website alongside the `active` flag.
- **The out-of-stock product is never restocked.** `openEveryShelf` explicitly skips `SEED_PRODUCT_IDS.scratchPostOutOfStock`; that is the reason it exists in the catalogue.
- **Runs once.** Do not call this module from multiple code paths in the same process; the result is designed to be produced once and replayed from memory by `src/app/demo.ts`.
