---
source: src/modules/products/tests/integration/backorder.test.ts
sha256: bfed6c89c19ddbe3ef511b30afe83952297ab8cba678f7ca1cda693613041b5d
generated_at: 2026-10-29T05:31:58.863464+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/backorder.test.ts

## Purpose

Integration tests that exercise the product backorder feature end-to-end over HTTP: verifying the derived `backorder` flag on GET, the write/read/validation rules for `allowBackorder` and `restockDate` on PATCH, the outbox events emitted for restock-date changes, and the `product.buyable_again` event fired on stock or edit transitions.

## Key elements

- **`inDays(days)`** — returns an ISO string `days` from now; used to construct restock and release dates in test payloads.
- **`backorderProduct(overrides)`** — creates a product via `createProduct` with `onHand: 0, allowBackorder: true`, then directly sets `backorderLimit: 5, backordered: 0` on `productModel`; returns the product id as a string.
- **`announced()`** — reads all `PRODUCT_RESTOCK_DATE_CHANGED` payloads from the outbox in insertion order.
- **`fired(id)`** — counts `PRODUCT_BUYABLE_AGAIN` rows in the outbox for a given product.
- **`idOf(product)`** — stringifies a product's `_id`.
- **`describe('GET /products/:id')`** — five cases: backorder flag with restock date, off by default, sold-out after date passes, preorder vs. backorder distinction, cap-full disables backorder.
- **`describe('PATCH /products/:id')`** — three cases: set/clear restockDate, 422 for >1-year date, past date accepted but reads sold out.
- **`describe('PATCH /products/:id restockDate announcements')`** — two cases: set → move → clear produces three outbox payloads with correct `from`/`to`; re-saving the same date emits nothing.
- **`describe('product.buyable_again')`** — two cases: event fires on stock-cache transitions that make a product orderable (not on every sync); event fires once per edit that transitions the product into a buyable state (backorder on, active on, restock date moved forward).

## Relationships

- **`tests/support/http.ts`** — provides `api()` (supertest client) and `authenticateAsRole('editor')` for authenticated PATCH calls.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` runs once at module load to prepare the test database.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds the initial product documents.
- **`src/modules/products/model.ts`** — `productModel` is used to assert stored field values and to seed `backorderLimit`/`backordered` that the inventory sync would normally set.
- **`src/modules/products/services/index.ts`** — `productService.syncStockCache` is called directly to simulate inventory-driven stock changes.
- **`src/modules/products/events.ts`** — imports `PRODUCT_BUYABLE_AGAIN` and `PRODUCT_RESTOCK_DATE_CHANGED` name constants for outbox queries.
- **`src/kernel/outbox.ts`** — `outboxEventModel` is the Mongoose model used to read and count emitted domain events.

## Notes

- `backorder` is **derived at read time** (from `allowBackorder`, `onHand`, `backorderLimit`, `backordered`, `restockDate`); it is never a stored column. Tests assert it only via the HTTP response body.
- `backorderLimit` and `backordered` are seeded with a raw `productModel.updateOne` because they are written by the inventory sync, not by the product API. Tests must replicate that write to reach the "cap full" scenario.
- Restock-date validation rejects any date more than one year ahead (422) but **accepts** past dates; a past date simply causes the product to read as sold out.
- The `buyable_again` event is transition-based: the stock-cache test fires 4 syncs but expects only 2 events, confirming it does not re-fire while the product is already buyable.
- Preorder and backorder are mutually exclusive in the response: a product before its `releaseDate` is `preorder: true, backorder: false` even if `allowBackorder` is set.
