---
source: src/modules/inventory/tests/contract/availability.contract.test.ts
source_sha256: 600a82923f74c628e1c1a97154a6b0fa418f6df55cfd4a94fca277f1689f2cfc
context_sha256: 7630b77955893cdc07805c537cd09d779e3f8cb4eb78501eb6961e4e6c41a026
generated_at: 2026-11-22T05:25:00.659159+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/contract/availability.contract.test.ts

## Purpose
Contract (HTTP-level) tests for the availability reads under `/products`: single-product (`GET /products/{id}/availability`) and batch (`GET /products/availability?id=...`). They cover the response shapes, the 100-id batch bound, the omission rule for unknown ids, and who may see a hidden (inactive) product. The rule that turns settings and counts into an availability value is not tested here; it lives in the products unit suite.

## Key elements
- `query(list)`: helper that builds a repeated `id=` query string.
- **Single-product suite**:
  - `in_stock` for a product with shelf units, with no date. It also checks `Cache-Control: public, no-cache`.
  - `out_of_stock` for an empty shelf.
  - `preorder` with `availabilityDate` equal to the release day.
  - `backorder` with `availabilityDate` equal to the restock day.
  - A backorder with no restock date is promised `shopDayOf(now + BACKORDER_PROMISE_DAYS * DAY_MS)`.
  - 404 for both an unknown id and a malformed id.
  - An inactive product is 404 for a guest and 200 for an admin.
  - Revalidation: sending `If-None-Match` with the first response's ETag returns 304.
- **Batch suite**:
  - Returns `items` for every requested product, and the test name says inventory answers this route rather than `/products/:id`.
  - Unknown ids are left out and the rest are answered.
  - A duplicated id is answered once.
  - A hidden product is omitted for a guest and included for an admin.
  - 100 ids are accepted and a 101st gets 422.
  - A malformed id gets 422 with a `VALIDATION_ERROR` error whose `details.field` matches `id` or `id.<n>`.

## Relationships
- `@tests/contract` is imported for its side effects. `setupTestDb` (`tests/support/setup-test-db.ts`) is called at module level to prepare the test database.
- `api` and `authenticateAs` (`tests/support/http.ts`) make the requests and produce the admin bearer token.
- `createProduct` (`src/modules/products/tests/factories.ts`) seeds products with `onHand`, `active`, `allowBackorder`, `releaseDate` and `restockDate`.
- `MISSING_ID` (`tests/support/ids.ts`) is a well-formed id that matches no product.
- `BACKORDER_PROMISE_DAYS` and `shopDayOf` come from `src/modules/shop/index.ts`, with logic in `src/modules/shop/service.ts`. `DAY_MS` comes from `src/domain-primitives/time.ts`. Together they compute the expected default backorder date.
- The preorder and backorder cases configure stock by calling `PATCH /inventory/levels/{id}` as an admin with `backorderLimit`.
- `src/modules/stats/controllers/respond.ts` is listed as a graph neighbor, but the file shows no direct use of it.

## Notes
- All availability dates are shop-day strings such as `2999-01-05`. Fixtures use the year 2999 so they stay in the future.
- The default backorder date test computes its expectation from `Date.now()` at run time, so it could be flaky if the shop day rolls over mid-test.
- Batch result order is not asserted. The tests use `arrayContaining` and compare lengths.
