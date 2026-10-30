---
source: src/modules/products/tests/contract/api.contract.test.ts
sha256: 49a4627efc70ddcbfa580329382cd1c3d88f70e3722bc176dee42348f86542b8
generated_at: 2026-10-29T05:31:02.945840+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/products` and `/products/search` endpoints. Every response is automatically validated against `openapi.yaml` (including `additionalProperties: false`) via the side-effect import of `@tests/contract`. Beyond shape, the suite pins behavioural invariants that the OpenAPI spec alone cannot express—scope enforcement for anonymous callers, pagination/id/sort validation limits, and text-length guards—so that a contract branch going unexercised or a filter leaking past a caller's scope is caught in CI.

## Key elements

- **`setupTestDb()`** – initialises the in-memory database once before the suite runs.
- **`describe('GET /products — the filters it now publishes')`** – verifies that `title` narrows results and that an anonymous caller requesting `active=false` still cannot see inactive rows (scope wins over filter).
- **`describe('GET /products')`** – shape + validation tests: anonymous/admin auth, empty list, pagination bounds (422 for out-of-range), blank-as-absent, repeated `?id=` (batch), empty/duplicate/malformed `id`, and 200-char text limit.
- **`describe('POST /products/search')`** – body-shape contract, 200-char limit on `title`/`category`/`tag` (both body and query), and a ~50 KB nested-JSON payload that must return 400 (depth guard) before cache-key construction.
- **`describe('sort — …')`** – ordering, case-insensitive text sort, cross-page stability, body-array vs. CSV/repeated-key query syntax, blank-as-absent, and 422 for any field outside the sort whitelist or malformed token.
- **`titlesOf`** – small local helper that maps a response body to an array of product titles for readable assertions.

## Relationships

- **`tests/support/contract.ts`** – imported as a side-effect (`import '@tests/contract'`); installs the automatic OpenAPI response-shape assertion on every `api()` call.
- **`tests/support/http.ts`** – provides `api()` (supertest-style request builder) and `authenticateAs(role)` for bearer-token auth.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` resets/initialises the test database.
- **`tests/support/environment.ts`** – `withEnvironmentOverrides` available for per-test config (imported; usage may be in truncated portion).
- **`src/modules/products/tests/factories.ts`** – `createProduct` seeds test data with optional overrides (`title`, `active`, `price`).
- **`src/modules/products/repository.ts`** – `productRepository` imported (likely used in truncated portion or for direct state verification).
- **`src/modules/locales/index.ts`** / **`src/modules/locales/services/index.ts`** – `localeService` used to exercise locale-dependent response fields.
- **`src/modules/locales/tests/factories.ts`** – `givenLocale` seeds locale fixtures.
- **`src/infrastructure/i18n/index.ts`** / **`src/infrastructure/i18n/overrides.ts`** – `refreshLocaleOverrides`, `registerLocaleOverrideProvider`, `resetLocaleOverrides` for locale-override test setup.

## Notes

- **Invariant over implementation.** The anonymous-scope test (stranger + `active=false`) asserts *only* that inactive rows are absent, not *how* the backend achieves it. The comment explicitly notes the Node backend merges scope last (overwriting the filter) while the PHP twin ANDs both clauses (empty result); pinning either mechanism would couple the test to merge order.
- **`@tests/contract` is a side-effect import.** No function is destructured from it; it monkey-patches or wraps the HTTP layer so that every `api()` response is schema-checked before the test's own assertions run. A 200 status in most tests implicitly means "shape matches `openapi.yaml`."
- **Shared schema limits.** The 200-char text cap and pagination `minimum`/`maximum` come from `shared/contracts/openapi.root.yaml` via `$ref`; the tests here confirm the endpoint enforces them rather than silently rewriting out-of-range values.
- **Sort token strictness (body).** In the POST body, each array item must be exactly one clean token (`-price`, `title`); a CSV string (`"-price,title"`), a padded value (`" price"`), or an empty string are all 422. The query string, by contrast, accepts both CSV and repeated-key syntax.
