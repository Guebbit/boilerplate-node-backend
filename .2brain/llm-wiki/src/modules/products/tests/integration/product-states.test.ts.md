---
source: src/modules/products/tests/integration/product-states.test.ts
source_sha256: 92883cd0341a9285709ed3d29ed72804b8179b362d629ead20871931c2dcf3ad
context_sha256: 999af81da5cfe716c7a39a06f48725aa53b9ed7b871b8f77209f1f7d32926448
generated_at: 2026-11-22T07:17:28.132048+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/integration/product-states.test.ts

## Purpose
HTTP-level integration tests for the two product visibility flags. `active: false` hides a product from shoppers entirely, while `purchasable: false` only takes it off sale. An anonymous user sees off-sale products in listings and by id, and never sees inactive ones; staff with the right permission see both.

## Key elements
- `titlesOf(body)`: helper that extracts `items[].title` from a search response body.
- `seedStates()`: creates four products in parallel via `createProduct`, one per state combination:
  - "On sale product"
  - "Off sale product" (`purchasable: false`)
  - "Hidden product" (`active: false`)
  - "Hidden and off sale" (both flags false)
- `describe('GET /products, anonymously')`:
  - The default listing returns only the on-sale and off-sale products.
  - `?purchasable=false` returns only the off-sale product.
  - `?purchasable=true` returns only the on-sale product.
  - `?purchasable=false&active=false` still returns nothing, because an anonymous request cannot opt into inactive products.
- `describe('GET /products/:id')`:
  - An off-sale product returns 200 with `purchasable: false, active: true`.
  - Both inactive products return 404 to an anonymous user, whatever their `purchasable` value.
  - An inactive product returns 200 with `active: false` for an `editor` role, per the test title "staff holding `display:Product`".

## Relationships
- `src/modules/products/tests/factories.ts`: provides `createProduct`, used to seed the products.
- `tests/support/http.ts`: provides `api()` (the request client) and `authenticateAsRole('editor')`, which returns a `bearer` value used as the `Authorization` header.
- `tests/support/setup-test-db.ts`: `setupTestDb()` is called at module top level to prepare the test database.

## Notes
- Tests that compare listings against a list use `.toSorted()` only for the unfiltered case. The filtered cases assert a single title, so they do not depend on order.
- `seedStates()` returns products in a fixed order. The tests destructure by position (`[, offSale]`, `states.slice(2)`, `states[2]`), so reordering the seed would break them.
- The authenticated test creates the role user before seeding.
- Only the `editor` role is exercised for staff access. There is no test of a role lacking `display:Product`.
