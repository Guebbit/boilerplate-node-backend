---
source: scenarios/flows/shop-history.ts
sha256: 49db9c11123fcf9a083cc4b02c7db7d84357fc8cf2c2612ded831bbb101c22d2
generated_at: 2026-09-27T13:49:54.615191+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/shop-history.ts

## Purpose

Drives the shop scenario's full order history by issuing real API calls (checkout, payment, shipping, cancellation, refund, deletion) rather than inserting rows. Because the data is produced by the application's own code, the payments, stock movements, shipments, and audit entries it generates stay correct as that code evolves. Runs once per process; `src/app/demo.ts` caches the result in memory and replays it on every restore.

## Key elements

- **`ShopHistory`** (exported interface) — the return shape: `subjects` (guarantee-name → row-id map, merged into `GET /__test/scenario`) and `ages` (order id → days-back, `0` = today).
- **`OLDEST_DAYS = 80`** — oldest order age, deliberately kept inside `NODE_AUDIT_RETENTION_DAYS` (90) so the audit trail is not TTL-reaped while the order still exists.
- **`FILLER_ORDERS`** — 13 orders across 10 named filler shoppers (7 single-order, 3 with two orders), providing volume for analytics and order-list screens.
- **`CUSTOMER_ORDERS`** — 3 larger orders for the `customer` seed account, mixing named catalogue rows with filler products.
- **`CARTS`** — 4 un-checked-out baskets (admin, marcus, harper, isla) written via `POST /cart` *after* all orders, because checkout empties the source cart.
- **`plannedDemand()`** — aggregates the total quantity every flow will buy per product, used to size opening stock.
- **`openEveryShelf(owner)`** — calls `POST /inventory/receipts` for every product (except the out-of-stock one) before any order, so shelves carry opening stock + demand.
- **`signInCustomerBase(baseUrl)`** — concurrent `signIn` for all filler shoppers (bcrypt cost-12 makes serial login the dominant cost).
- **`driveCatalogueEdits(owner)`** — a price `PATCH` and a locale edit (delegated to `shopModules.locales.driveHistoryEdit`) run *after* all orders so the audit trail reads chronologically.
- **`banOneCustomer(owner)`** — `PATCH /users/:id { active: false }` for marcus, done last so his prior orders are intact.
- **`signOutEveryone(callers)`** — `POST /account/logout-all` for every caller to avoid shipping phantom refresh-token sessions.

## Relationships

- **`scenarios/flows/actions.ts`** — supplies every domain operation this file drives: `checkout`, `checkoutAndPay`, `openPayment`, `submitCard`, `syncPayment`, `receiveStock`, `startProcessing`, `shipOrder`, `deliverOrder`, `cancelOrder`, `softDeleteOrder`, `hardDeleteProduct`, `replaceProductImage`, `recordOfflinePayment`.
- **`scenarios/flows/client.ts`** — provides `signIn` and the `Caller` type used for all authenticated requests.
- **`scenarios/accounts.ts`** — seed credentials for admin and the `customer` account.
- **`scenarios/products.ts`** — `productFixtures`, `fillerProductId`, `openingStockFor` (catalogue shape and base stock).
- **`scenarios/subjects.ts`** — `SEED_PRODUCT_IDS` (stable ids for named products like `dogFoodStandard`, `dogBedPremium`, `scratchPostOutOfStock`).
- **`scenarios/users.ts`** — `SEED_CUSTOMER_EMAILS`, `SEED_CUSTOMER_IDS` (filler shopper identities).
- **`scenarios/shop-modules.ts`** — `shopModules.locales.driveHistoryEdit` (locale dictionary edit for the audit trail).
- **`src/modules/users/factories.ts`** — `PLAIN_PASSWORD` constant used for filler shopper sign-in.
- **`scenarios/index.ts`** — orchestrates this module as part of the scenario boot sequence.

## Notes

- The file is a side-effect `@module`; it exports only the `ShopHistory` type. All logic runs as top-level statements in the (truncated) main body.
- Carts are intentionally written **last** in the flow: a checkout empties its source cart, so a pre-existing cart would be gone by the time the dataset is inspected.
- `openEveryShelf` skips `scratchPostOutOfStock` entirely — that product's zero stock *is* its fixture state.
- Sign-in is the only concurrent step; all subsequent order/payment/ship calls are serial so the resulting timestamps form a coherent story.
- `banOneCustomer` uses `PATCH` (partial update) rather than `PUT`, which would wipe unrelated user fields.
- The `DOG_FOOD` helper and the overstated demand figures for named rows (40× dog food, 30× dog bed) are deliberately generous so no mid-flow checkout fails on a one-unit shortage.
