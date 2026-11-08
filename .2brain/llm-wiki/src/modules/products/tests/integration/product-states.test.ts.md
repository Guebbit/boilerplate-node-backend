---
source: src/modules/products/tests/integration/product-states.test.ts
sha256: b1678954635fc11727691467e6375865e3ad9e9407bbaf52ceaeec2dcf02d23b
generated_at: 2026-11-08T07:52:16.633273+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/product-states.test.ts

## Purpose
Integration tests verifying the two product visibility flags (`active` and `purchasable`) over HTTP. They assert how an anonymous shopper and an authenticated staff member see products in listing and by-id endpoints across all four flag combinations.

## Key elements
- **`titlesOf(body)`** – Extracts `title` strings from the `{ items: [{ title }] }` response shape for easy assertions.
- **`seedStates()`** – Creates four products covering every flag combination: on-sale, off-sale (`purchasable: false`), hidden (`active: false`), and both flags off. Returns them as a tuple.
- **`describe('GET /products, anonymously')`** – Four cases: default listing hides inactive products; `?purchasable=false` / `=true` filters; combined `?purchasable=false&active=false` yields an empty list.
- **`describe('GET /products/:id')`** – Three cases: off-sale product is publicly visible (200, `purchasable: false`); inactive product returns 404 regardless of `purchasable`; inactive product is visible to an editor holding `display:Product` (200).

## Relationships
- **`tests/support/http.ts`** – Supplies the `api()` HTTP client and `authenticateAsRole()` used to obtain a bearer token for the staff-visibility test.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called once at module scope to provision/reset the test database before any test runs.
- **`src/modules/products/tests/factories.ts`** – `createProduct()` is the factory that inserts seed products with the desired flag values.

## Notes
- `setupTestDb()` runs at import time (top-level), not inside a `beforeEach`, so it executes once per file.
- `titlesOf` casts the body to `{ items: … }`; if the API ever changes its envelope shape, this helper will silently return `undefined` rather than failing loudly.
- The `?purchasable=false&active=false` test asserts that the `active` filter is *not* overridable by the `purchasable` param—an inactive product stays hidden even when explicitly requested.
- Uses `Array.prototype.toSorted()` (ES 2023); the project's target/lib must include it.
