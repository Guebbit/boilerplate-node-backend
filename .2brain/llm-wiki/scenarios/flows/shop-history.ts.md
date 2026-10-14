---
source: scenarios/flows/shop-history.ts
sha256: 9df836872720d471db21edc6dfbefdde4e679d9eee82eb9429820563864a1c2f
generated_at: 2026-10-14T06:58:21.951822+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/shop-history.ts

## Purpose

Drives the "shop" scenario's full order book end-to-end through real HTTP calls (checkout → payment → ship → decline/refund/cancel/delete) so that every payment, stock movement, reservation, shipment, audit entry, and analytics event is produced by application code rather than hand-inserted rows. Runs **once per process**; the result is held in memory and replayed on every subsequent restore by `scenarios/support/demo.ts`.

## Key elements

- **`ShopHistory`** (exported interface) — the shape this flow returns: `subjects` (a guarantee-name → row-id map merged into `GET /__test/scenario`) and `ages` (order-id → days-ago map used to backdate rows).
- **`OLDEST_DAYS = 80`** — upper bound on backdating; kept inside the 90-day audit-retention window so the audit trail is not TTL-reaped while the order still exists.
- **`FILLER_ORDERS`** — 13 orders across 10 named filler shoppers; pure volume for analytics and order-list screens.
- **`CUSTOMER_ORDERS`** — 3 larger orders for the `customer` account mixing `SEED_PRODUCT_IDS` rows with filler products.
- **`CARTS`** — 3 unfinished carts (marcus, harper, isla) added via `POST /cart` *after* all checkouts so they are not emptied.
- **`plannedDemand()`** — aggregates every unit the flows will buy into a `Map<productId, qty>` so stock receipts cover it.
- **`openEveryShelf(owner)`** — calls `POST /inventory/receipts` for every product (except the out-of-stock one) with `openingStockFor` + planned demand, so no checkout fails mid-run.
- **`signInCustomerBase(baseUrl)`** — concurrent `signIn` for all filler shoppers (argon2id cost makes serial login the dominant runtime cost).
- **`driveCatalogueEdits(owner)`** — a price `PATCH` on the dog-food product plus per-module edits from `shop-modules.ts`; runs after all orders so audit timestamps read naturally.
- **`banOneCustomer(owner)`** — `PATCH /users/:id` to set `active: false` on marcus; uses PATCH (not PUT) to avoid clearing unrelated fields.
- **`signOutEveryone(callers)`** — `POST /account/logout-all` for every caller, preventing phantom refresh-token sessions from leaking into the dataset.

## Relationships

- **`scenarios/flows/actions.ts`** — provides every HTTP action used here (`checkout`, `checkoutAndPay`, `shipOrder`, `receiveStock`, `softDeleteOrder`, `cancelOrder`, `requestReturn`, `submitCard`, `syncPayment`, `hardDeleteProduct`, `replaceProductImage`, etc.).
- **`scenarios/flows/client.ts`** — `signIn()` and the `Caller` type; every actor in this flow is a `Caller`.
- **`scenarios/products.ts`** — `productFixtures` (iterates the full catalogue for stock receipts) and `openingStockFor`.
- **`scenarios/products-filler.ts`** — `fillerProductId(index)` resolves a filler catalogue index to a real product id.
- **`scenarios/subjects.ts`** — `SEED_PRODUCT_IDS` for the named products (dog food, dog bed, scratch post, etc.).
- **`scenarios/users.ts`** — `SEED_CUSTOMER_IDS` and `SEED_CUSTOMER_EMAILS` for the filler customer base.
- **`scenarios/accounts.ts`** — `SEED_ADMIN_*` and `SEED_USER_*` credentials for the owner/staff callers.
- **`scenarios/shop-modules.ts`** — `historyEdits()` contributes module-specific audit-trail edits.
- **`src/modules/orders/services/index.ts`** — `withdrawalPeriodDays` (referenced for return/refund timing logic).
- **`src/modules/users/factories.ts`** — `PLAIN_PASSWORD` used in the concurrent sign-in batch.

## Notes

- **Runs once, replayed forever.** The file's docblock and `scenarios/support/demo.ts` contract mean the expensive work happens a single time; subsequent restores read the in-memory `ShopHistory`.
- **Stock is deliberately overstated** for named-product rows (`50` dog food, `15` bed) so no checkout 404s three hundred requests into a boot.
- **The out-of-stock product (`scratchPostOutOfStock`) receives no stock receipt by design** — its catalogue entry exists to demonstrate the OOS state.
- **Carts are written last** because `checkout` empties the source cart; any cart created earlier would be gone.
- **Sign-in is the only concurrent step**; every subsequent action is sequential so the audit/order timeline is deterministic.
- **Backdating respects `NODE_AUDIT_RETENTION_DAYS` (90):** `OLDEST_DAYS` is 80 so an order's own audit rows are not TTL-reaped while the order itself still exists.
