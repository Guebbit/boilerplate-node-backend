---
source: src/modules/products/tests/integration/backorder.test.ts
source_sha256: 5fa6a2eb4c447b7c66aa57ef9864cc266df44b604a80d451ba845dc026f2ba20
context_sha256: 84f443975d804dc5c058de94700de345eda9aebf7164c910c5ac61d18d5daad7
generated_at: 2026-11-22T07:15:43.418388+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/integration/backorder.test.ts

## Purpose
HTTP-level integration tests for a product's `allowBackorder` and `restockDate` fields via `PATCH /products/:id`. They cover writing and reading back the switch and date, the one-year-ahead bound on the date, acceptance of a past date, and the `product.restock_date_changed` outbox events. How a backorder reads (availability) is tested elsewhere, in `src/modules/products/tests/unit/availability.test.ts`.

## Key elements
- `inDays(days)`: returns the shop day (`YYYY-MM-DD`) that many days from now, using `shopDayOf`. This is the format a client sends.
- `stored(day)`: converts a shop day to the ISO string of the shop's midnight (`startOfShopDay(day).toISOString()`). This is the form the factory takes and the form announcements carry.
- `announced()`: reads `outboxEventModel` rows named `PRODUCT_RESTOCK_DATE_CHANGED`, sorted by `_id`, and returns their payloads.
- `describe('PATCH /products/:id')`:
  - Sets `allowBackorder` and `restockDate`, then clears the date with `null`. The cleared body has no `restockDate`, and `allowBackorder` stays `true`.
  - Rejects a date 400 days out with 422 and leaves `restockDate` unset in the DB.
  - Accepts a past date (`inDays(-5)`) with 200 and echoes it back.
- `describe('... restockDate announcements')`:
  - Setting, moving and clearing a date produces three payloads: `{productId, to}`, `{productId, from, to}` and `{productId, from}`.
  - Saving the date a product already has produces no event.

## Relationships
- `@tests/http` (`tests/support/http.ts`): provides `api()` for requests and `authenticateAsRole('editor')` for a bearer token.
- `@tests/setup-test-db` (`tests/support/setup-test-db.ts`): `setupTestDb()` is called at module level to prepare the test DB.
- `src/modules/products/tests/factories.ts`: `createProduct()` creates fixtures, optionally with a preset `restockDate`.
- `src/modules/products/model.ts`: `productModel` is used to check that nothing was written after a rejected request.
- `src/modules/products/events.ts`: supplies the `PRODUCT_RESTOCK_DATE_CHANGED` event name.
- `src/kernel/outbox.ts`: `outboxEventModel` is queried to check the announced payloads.
- `src/modules/shop/index.ts` (which re-exports from `src/modules/shop/service.ts`): `shopDayOf` and `startOfShopDay` do the shop-day conversions.

## Notes
- All requests are made as the `editor` role.
- The test titled "accepts a date in the past: the product then reads sold out" only asserts the 200 status and the echoed date. The sold-out reading itself isn't checked here.
- Announcement payloads use ISO instants (`stored(...)`), while the HTTP body uses `YYYY-MM-DD` days.
- The first `describe` has a local `stored` variable in the 422 test that shadows the module-level `stored` helper.
