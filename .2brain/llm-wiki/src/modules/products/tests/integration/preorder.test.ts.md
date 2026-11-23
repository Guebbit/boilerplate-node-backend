---
source: src/modules/products/tests/integration/preorder.test.ts
source_sha256: 500284d41525e8470db01fee4c8b32981a137c2c78e20f89844b2b2209688a12
context_sha256: 7b194e981093863d62d8a34964dc306e25846b2c9b26491b734179843285c9a8
generated_at: 2026-11-22T07:17:14.647403+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/integration/preorder.test.ts

## Purpose
HTTP-level integration tests for a product's `releaseDate`. They check that a future date makes a product a preorder (decided by `availability`, not the product), that the date is bounded to one year ahead, and that changing it writes a `product.release_date_changed` event to the outbox in the same transaction as the edit.

## Key elements
- `setupTestDb()`: called at module level to prepare the test database.
- `inDays(days)`: the shop day (`YYYY-MM-DD`) `days` from now, which is the form a client sends.
- `stored(day)`: the ISO instant of the shop's midnight for that day, which is how a day is stored and what the factory accepts.
- `announced()`: reads `outboxEventModel` rows named `PRODUCT_RELEASE_DATE_CHANGED`, sorted by `_id`.
- `announcedPayloads()`: the payloads of those rows, in write order.
- `GET /products/:id` suite: a future release date is returned as the shop day.
- `PATCH /products/:id releaseDate` suite:
  - Setting a date and clearing it with `null`. The payloads are `{productId, to}` and then `{productId, from}`, and the cleared response has no `releaseDate`.
  - Moving a date emits one event with both `from` and `to`.
  - Sending the day that is already stored returns 200 and emits no event.
  - A date 400 days ahead returns 422 and writes no event.
  - A past date is accepted, returns 200, and is read back as that day.
- `a release day is stored as the shop midnight` suite:
  - A parameterised test (`it.each`) on the Rome DST days `2026-03-29` and `2026-10-25`. It checks the PATCH response, the stored instant (read through `productService`) and a later GET.
  - A full ISO instant such as `2027-01-05T10:00:00.000Z` is rejected with 422, because a promise is a day.

## Relationships
- `tests/support/http.ts`: provides `api()` and `authenticateAsRole('editor')`. Every PATCH is made with an editor bearer token.
- `tests/support/setup-test-db.ts`: provides `setupTestDb`.
- `src/modules/products/tests/factories.ts`: `createProduct` seeds products, optionally with a `releaseDate`.
- `src/kernel/outbox.ts`: `outboxEventModel` is queried to inspect the announced events.
- `src/modules/products/events.ts`: `PRODUCT_RELEASE_DATE_CHANGED` is the event name filtered on.
- `src/modules/products/services/index.ts`: exports `productService`, used to read the stored `releaseDate` directly in the DST tests.
- `src/modules/shop/index.ts` (and `service.ts`): `shopDayOf` and `startOfShopDay` convert between shop days and instants. The tests build their dates with them.

## Notes
- The DST cases use 2026-03-29 (23-hour day) and 2026-10-25 (25-hour day) to check that the shop midnight is not computed with a naive fixed offset. The expected instants are `2026-03-28T23:00:00.000Z` and `2026-10-24T22:00:00.000Z`.
- `inDays` is relative to `Date.now()`, so dates move with the clock. The 400-day case is well past the one-year limit.
