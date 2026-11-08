---
source: src/modules/products/tests/integration/preorder.test.ts
sha256: 5abc1d5f54e96db5ff4beb15f32490588e7b58486538bd87190f921477909615
generated_at: 2026-11-08T07:52:07.731720+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/preorder.test.ts

## Purpose

Integration tests that exercise the preorder behavior of a product over HTTP: a future `releaseDate` marks a product as a preorder (a derived flag, never persisted), the date is bounded to one year ahead, clearing/moving the date emits a `product.release_date_changed` outbox event within the edit's transaction, and the stored instant always corresponds to the shop's local midnight (including DST edge cases).

## Key elements

- **`inDays(days)`** — returns a `YYYY-MM-DD` string `days` from now, in the shop's timezone (via `shopDayOf`).
- **`stored(day)`** — converts a `YYYY-MM-DD` day into the ISO instant of that shop day's midnight (via `startOfShopDay`). Used as the value the factory writes.
- **`announced()`** — queries `outboxEventModel` for rows named `PRODUCT_RELEASE_DATE_CHANGED`, sorted by `_id`.
- **`announcedPayloads()`** — maps those rows to their `payload` objects in write order.
- **`describe('GET /products/:id')`** — asserts the derived `preorder` flag (true for future + purchasable, false for past/off-sale), and that `lowStock` is suppressed on a preorder.
- **`describe('PATCH /products/:id releaseDate')`** — covers setting a date, clearing with `null`, moving (from→to payload), no-op when unchanged, 422 for >1 year ahead, and accepting a past date.
- **`describe('a release day is stored as the shop midnight')`** — parametric test over Rome's DST-transition days verifying the exact stored UTC instant round-trips back to the same `YYYY-MM-DD`; also asserts that an ISO instant (not a bare day) is rejected with 422.

## Relationships

- **`tests/support/http.ts`** — provides `api` (supertest client) and `authenticateAsRole` for every HTTP call.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module scope to prepare a clean DB.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds product documents (accepts `releaseDate`, `purchasable`, `onHand`).
- **`src/kernel/outbox.ts`** — `outboxEventModel` is queried to assert outbox rows exist (or don't) after a PATCH.
- **`src/modules/products/events.ts`** — supplies the `PRODUCT_RELEASE_DATE_CHANGED` event-name constant used in assertions.
- **`src/modules/products/services/index.ts`** — `productService.findByIdRaw` reads the raw stored instant to verify the midnight mapping.
- **`src/modules/shop/index.ts`** — `shopDayOf` and `startOfShopDay` define the shop-timezone day↔instant conversions used by the helpers.

## Notes

- Preorder is purely derived at read time: `future releaseDate && purchasable`. No column is toggled.
- The one-year boundary is enforced server-side (422); the test uses `inDays(400)` to cross it.
- A `null` body field clears the date; the response then omits `releaseDate` entirely.
- The DST tests hard-code Rome's 2026 transition dates (`2026-03-29`, `2026-10-25`) and the exact expected UTC midnights (`23:00` / `22:00` previous UTC day). If the shop timezone changes, both the dates and the expected instants must be updated.
- Outbox assertions rely on `_id` sort order as a proxy for write order; the test file does not clear the outbox table between cases—each `announced()` call sees only the events written by the test that ran immediately before it (fresh DB per file via `setupTestDb`).
