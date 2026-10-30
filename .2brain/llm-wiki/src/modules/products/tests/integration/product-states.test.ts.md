---
source: src/modules/products/tests/integration/product-states.test.ts
sha256: b1678954635fc11727691467e6375865e3ad9e9407bbaf52ceaeec2dcf02d23b
generated_at: 2026-10-29T05:33:21.506974+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/product-states.test.ts

## Purpose

Integration tests that verify the two product visibility flags (`active` and `purchasable`) behave correctly over HTTP. Confirms that anonymous shoppers see only `active && purchasable` or `active && !purchasable` products in listings and by ID, that `active: false` hides a product entirely (404), and that staff with `display:Product` can still view hidden products.

## Key elements

- **`titlesOf(body)`** – Extracts an array of product titles from a listing response (expects `{ items: { title }[] }` shape).
- **`seedStates()`** – Creates four products covering every `active` × `purchasable` combination and returns them in fixed order: `[onSale, offSale, hidden, hiddenOffSale]`.
- **`describe('GET /products, anonymously')`** – Four cases: default listing excludes inactive products; `?purchasable=false` / `?purchasable=true` filter correctly; combining filters with `active=false` returns empty.
- **`describe('GET /products/:id')`** – Three cases: off-sale product returns 200 with flags visible; inactive product returns 404 regardless of `purchasable`; staff (`editor` role, `display:Product`) get 200 for an inactive product.

## Relationships

- **`tests/support/http.ts`** – Provides `api()` (HTTP client for making requests) and `authenticateAsRole()` (obtains a bearer token for a given role, used in the staff test).
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module scope to seed/reset the test database before any test runs.
- **`src/modules/products/tests/factories.ts`** – `createProduct()` is the sole factory used by `seedStates()` to insert the four fixture products.

## Notes

- Tests destructure `seedStates()` results by index (e.g. `const [, offSale] = await seedStates()`). Adding or reordering products in `seedStates` will silently break index-based references.
- `titlesOf` casts the body without runtime validation; it will throw at `.map` if the response shape ever changes.
- The `active` flag is strictly stronger: an inactive product is invisible even when explicitly filtered for, while an off-sale product remains publicly visible and flagged.
- Staff access is tested only for the `editor` role; no negative test verifies that a lower-privilege role is denied.
