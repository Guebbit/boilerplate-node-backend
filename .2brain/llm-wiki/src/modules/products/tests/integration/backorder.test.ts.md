---
source: src/modules/products/tests/integration/backorder.test.ts
sha256: 2e8fb479af1c5452914088be38c31f5a5cc626df7a83ec2be1acfea7297d5b15
generated_at: 2026-11-14T21:30:41.857812+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/backorder.test.ts

## Purpose

Integration tests for the product backorder feature over HTTP. Verifies that `allowBackorder` and `restockDate` round-trip through GET and PATCH, that the derived `backorder` flag is computed correctly (never persisted), that restock dates are bounded to one year ahead, that a passed date makes the product read sold out, and that the correct outbox events (`product.restock_date_changed`, `product.buyable_again`) are emitted with the right payloads and cardinality.

## Key elements

- **`inDays(days)`** — returns a `YYYY-MM-DD` shop-day string offset from today.
- **`stored(day)`** — converts a shop-day string to the ISO instant the factory expects.
- **`backorderProduct(overrides?)`** — creates a product with `onHand: 0`, `allowBackorder: true`, then directly sets `backorderLimit: 5` / `backordered: 0` via the model.
- **`announced()`** — reads all `PRODUCT_RESTOCK_DATE_CHANGED` outbox rows in insertion order, returning their payloads.
- **`fired(id)`** — counts `PRODUCT_BUYABLE_AGAIN` outbox rows for a given product id.
- **`describe('GET /products/:id')`** — five cases covering: backorder flag + restock date echo, product without the flag, passed restock date → sold out, preorder vs. backorder distinction, and cap-full → backorder closes.
- **`describe('PATCH /products/:id')`** — editor-authenticated writes: set/clear restock date, 422 on >1-year date, past-date acceptance.
- **`describe('PATCH … restockDate announcements')`** — verifies outbox event sequence for set → move → clear, and no-op on unchanged value.
- **`describe('product.buyable_again')`** — verifies stock-synchronization fires the event exactly once per sold-out→orderable transition, and that PATCH edits (enable backorder, unhide, fix a passed date) each fire it once.

## Relationships

- **`tests/support/http.ts`** — source of `api()` (Supertest-style HTTP client) and `authenticateAsRole()` for editor tokens.
- **`tests/support/setup-test-db.ts`** — called once at module top to isolate each test against a clean database.
- **`src/modules/products/tests/factories.ts`** — provides `createProduct()` for building fixture products.
- **`src/kernel/outbox.ts`** — provides `outboxEventModel` used to assert event emission.
- **`src/modules/shop/index.ts`** — re-exports `shopDayOf` and `startOfShopDay`, used for date math in helpers.
- **`src/modules/products/model.ts`** — provides `productModel` for direct Mongo reads/writes (bypassing services) in setup and assertions.
- **`src/modules/products/services/index.ts`** — provides `productService`, used to trigger stock-synchronization in the `buyable_again` tests.
- **`src/modules/products/events.ts`** — provides the `PRODUCT_RESTOCK_DATE_CHANGED` and `PRODUCT_BUYABLE_AGAIN` name constants.

## Notes

- `backorder` is a **derived** response field; tests assert it in the JSON body but never write it to the DB. The `backorderProduct` helper writes `backorderLimit` directly via `productModel.updateOne` to simulate inventory-sync state.
- Date validation is tested at the HTTP boundary (422 on 400-day date) rather than by inspecting a service-layer error type.
- The `fired()` helper confirms **at-most-once** semantics: repeated stock-synchronization calls while the product is already orderable do not re-emit `PRODUCT_BUYABLE_AGAIN`.
- All PATCH tests use the `editor` role; no tests exercise the unauthenticated path for writes.
