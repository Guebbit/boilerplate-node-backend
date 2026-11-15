---
source: src/modules/products/tests/contract/api.contract.test.ts
sha256: 602433be48b257e363d7681363f9f30ba943e90ffc619bc2941da2b9de5dd58b
generated_at: 2026-11-14T21:30:09.304744+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/products` endpoints. They assert that the wire response shape conforms to the OpenAPI contract (enforced by the `@tests/contract` setup, including `additionalProperties: false` to catch unexpected field leakage) and that a small set of behavioural guarantees—scope enforcement, pagination validation, filter limits, date formatting, and sort order—are actually exercised on the wire. They are not a replacement for unit/service tests; they exist to prove the contract surface and its edge cases.

## Key elements

- **`setupTestDb()`** – Initialises an isolated test database before all suites in this file.
- **`describe('GET /products — the filters it now publishes')`** – Verifies that `?title=` narrows results for an admin, that a stranger's scope still pins `active: true` (so `?active=false` does not leak unlisted rows), without pinning *how* the backend achieves that.
- **`describe('GET /products')`** – Contract conformance for anonymous and admin callers, empty list, pagination; `it.each` over out-of-range `page`/`pageSize` expecting `422 application/problem+json`; blank params treated as absent; repeated `?id=` batch (valid, over-cap → 422, empty → 422, duplicate → 1 row, one malformed → 422); `?text=` over 200 chars → 422.
- **`describe('POST /products/search')`** – Contract conformance; per-field (`title`/`category`/`tag`) 200-char limit on both body and query; a 100 KB nested-JSON body rejected with 400 before cache-key construction.
- **`describe('promise dates on the list reads')`** – Asserts `releaseDate` and `restockDate` serialise as the shop-local date string (via `startOfShopDay`) on both GET and POST responses.
- **`describe('sort — GET /products?sort= and POST /products/search { sort }')`** – Sort by one or more fields, ascending/descending (`-` prefix), case-insensitive text, multi-key priority, page-continuation consistency, array form in search body, repeated-key CSV equivalent, blank sort handling.
- **`titlesOf`** – Small helper extracting the ordered `title` array from a paginated response body.

## Relationships

- **`tests/support/contract.ts`** (`@tests/contract`) – Side-effect import; registers automatic response shape-validation on every `api()` call so each endpoint's output is checked against the published contract, including `additionalProperties: false`.
- **`tests/support/http.ts`** – Provides `api()` (supertest-style HTTP client) and `authenticateAs()` (Bearer-token auth) used throughout.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` clears/seeds the test database at module load.
- **`tests/support/environment.ts`** – `withEnvironmentOverrides` imported for environment-scoped test configuration (used in the truncated portion).
- **`src/modules/products/tests/factories.ts`** – `createProduct()` builds fixture products with specified `title`, `price`, `active`, `releaseDate`, `restockDate`, etc.
- **`src/modules/locales/tests/factories.ts`** – `givenLocale()` for locale-dependent fixtures (truncated portion).
- **`src/modules/locales/index.ts`** – `localeService` imported for locale-aware assertions (truncated portion).
- **`src/infrastructure/i18n/index.ts` / `overrides.ts`** – `refreshLocaleOverrides`, `registerLocaleOverrideProvider`, `resetLocaleOverrides` for i18n override lifecycle in tests (truncated portion).
- **`src/modules/shop/index.ts`** – `startOfShopDay()` converts a calendar date to the shop's local midnight, used in date-formatting assertions.
- **`src/modules/products/repository.ts`** – `productRepository` imported for direct data manipulation in the truncated portion.

## Notes

- The file deliberately separates *contract shape* from *behavioural logic*. Comments call out that the stranger-scope test asserts the guarantee ("a stranger does not see unlisted rows") but not the mechanism, so a backend can change its merge strategy (overwrite vs. AND) without breaking the test.
- Pagination validation: out-of-range values → `422 problem+json`; *blank* values (`?page=&pageSize=`) → treated as absent, defaults returned. This distinction is intentional and tested explicitly.
- The 200-character text limit comes from a shared `Text` schema referenced via `$ref`; the test documents that this is inherited by every search endpoint.
- The depth-guard test constructs a ~100 KB JSON string of nested arrays to verify the server rejects it with 400 *before* building a cache key, protecting against both DoS and cache-pollution.
- `additionalProperties: false` in the OpenAPI spec is the mechanism that would flag an unexpected field leaking into the payload; the `@tests/contract` import is what enforces it on every response automatically.
