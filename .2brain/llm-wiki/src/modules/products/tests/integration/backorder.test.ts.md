---
source: src/modules/products/tests/integration/backorder.test.ts
sha256: 673a49e178755e5bcb670291298df9606a3cadd030cc2feccdb63d12ac1c5a8f
generated_at: 2026-11-08T07:50:35.156398+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/backorder.test.ts

## Purpose

Integration tests that exercise the backorder feature over HTTP: verifying the `allowBackorder` switch and `restockDate` can be set, cleared, and read back; that the derived `backorder` flag (never stored) reflects the correct combination of stock, date, and cap; that the restock date is bounded to one year ahead; and that the `product.restock_date_changed` and `product.buyable_again` outbox events fire with correct payloads and only on meaningful transitions.

## Key elements

- **`inDays(days)`** — converts a day offset from now into the `YYYY-MM-DD` shop-day string a client would send.
- **`stored(day)`** — converts a shop-day string into the ISO instant (shop midnight) that the factory and outbox payloads use.
- **`backorderProduct(overrides?)`** — creates a product with `onHand: 0`, `allowBackorder: true`, then writes `backorderLimit: 5, backordered: 0` directly via `productModel.updateOne` (simulating inventory sync).
- **`announced()`** — reads all `PRODUCT_RESTOCK_DATE_CHANGED` outbox rows in insertion order and returns their payloads.
- **`fired(id)`** — counts `PRODUCT_BUYABLE_AGAIN` outbox rows for a given product.
- **`idOf(product)`** — stringifies a document's `_id`.
- **`describe('GET /products/:id')`** — five cases covering: backorder flag + restock date on a released product; no flag when switch is off; sold-out read once restock date passes; preorder vs. backorder distinction before release; cap-full closes the backorder.
- **`describe('PATCH /products/:id')`** — set/clear restockDate round-trip; 422 rejection for >1-year-ahead date (nothing written); past date accepted but product reads sold-out.
- **`describe('PATCH /products/:id restockDate announcements')`** — outbox payloads for set → move → clear sequence; no event when the same date is saved again.
- **`describe('product.buyable_again')`** — event fires exactly once per transition to buyable (stock sync and edit-triggered transitions), not on repeated or unrelated changes.

## Relationships

- **`tests/support/http.ts`** — provides `api()` (Supertest-style HTTP client) and `authenticateAsRole('editor')` for all request calls.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to initialise and isolate the test database.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds product documents with the given overrides.
- **`src/modules/products/model.ts`** — `productModel` is used for direct `$set` updates (simulating inventory sync) and for asserting DB state after a rejected write.
- **`src/modules/products/services/index.ts`** — `productService.syncStockCache` drives the stock-change path that triggers `product.buyable_again`.
- **`src/modules/products/events.ts`** — provides the `PRODUCT_RESTOCK_DATE_CHANGED` and `PRODUCT_BUYABLE_AGAIN` event name constants used to query the outbox.
- **`src/kernel/outbox.ts`** — `outboxEventModel` is the Mongoose model queried to verify which events were written and their payloads.
- **`src/modules/shop/index.ts`** — `shopDayOf` and `startOfShopDay` supply the shop-local date arithmetic the helpers rely on.

## Notes

- `backorder` is **derived at read time** and never persisted; the tests confirm this by asserting it flips to `false` when the date passes or the cap fills, without any write.
- `backorderProduct` writes `backorderLimit` / `backordered` **directly on the model** (bypassing the API) because those fields are managed by the inventory sync job, not by product edits.
- A past `restockDate` is a **valid input** (200 OK) — the product simply reads as sold-out. Only a date **more than one year in the future** is rejected (422).
- The `product.buyable_again` test calls `syncStockCache` four times in sequence to prove the event fires only on the *transition* into buyable state (twice: 0→4 and 0-reserved→4-free), not on every sync.
- The `announced()` helper relies on `_id` insertion order as a substitute for an explicit timestamp; this is correct under the outbox append-only contract.
