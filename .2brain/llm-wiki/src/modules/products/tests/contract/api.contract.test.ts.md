---
source: src/modules/products/tests/contract/api.contract.test.ts
sha256: 89c09a34479a2e6beeb1770d3b4d48bf63963415cef23c5fa7479c9406fd5cd2
generated_at: 2026-11-08T07:49:39.604295+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/products` endpoints that validate the **shape of the wire response** against `openapi.yaml` (including `additionalProperties: false`). They do not assert *which* products a role sees (that lives in unit/service suites) — they exist to prove each contract branch is exercised, that pagination/filter limits are actually enforced, and that response fields (dates, sort order, batch-id semantics) match the published schema.

## Key elements

- **`describe('GET /products — the filters it now publishes')`** — verifies `title` and `active` query filters: admin sees inactive rows, a stranger's visibility scope overrides `active=false` so the unlisted catalogue is never leaked regardless of merge order.
- **`describe('GET /products')`** — the bulk of the suite:
  - Anonymous / admin / empty-list / paginated response-shape checks (status 200, items length).
  - `it.each` rejecting out-of-range `page`/`pageSize` (0, 500, non-numeric, fractional) with **422 + `application/problem+json`**.
  - Blank query values treated as absent (defaults apply, not 422).
  - Repeated `?id=` batch filter: valid batch, >100 ids → 422, empty `?id=` → 422, duplicated id collapses, one malformed id poisons the whole batch.
  - `?text=` capped at 200 chars (shared `Text` schema in `openapi.root.yaml`).
- **`describe('POST /products/search')`** — same 200-char cap on `title`/`category`/`tag` (response-cache-key DoS guard) and a depth-limit test (nested JSON > walker stack → **400**, not 500).
- **`describe('promise dates on the list reads')`** — `releaseDate` / `restockDate` serialise as the shop-day date string on both GET and search responses.
- **`describe('sort — …')`** — multi-field sort, `-` prefix for descending, case-insensitive text sort, sort stability across pages, `sort` as CSV *or* repeated key *or* search-body array.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` (`@tests/contract`) | Imported as a side-effect; wires every `api()` response through the OpenAPI validator so shape assertions are automatic. |
| `tests/support/http.ts` | Provides `api()` (supertest wrapper) and `authenticateAs(role)` for bearer-token requests. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` called at module top to provision a clean database per run. |
| `tests/support/environment.ts` | `withEnvironmentOverrides` available for per-test env config (imported for locale-override tests). |
| `src/modules/products/tests/factories.ts` | `createProduct(...)` seeds fixtures with title, price, `active`, `releaseDate`, `restockDate`, etc. |
| `src/modules/locales/tests/factories.ts` | `givenLocale(...)` seeds locale rows needed by i18n assertions. |
| `src/modules/locales/index.ts` / `src/modules/locales/services/index.ts` | Exports `localeService`, used in locale-specific contract branches. |
| `src/infrastructure/i18n/index.ts` | `registerLocaleOverrideProvider`, `refreshLocaleOverrides`, `resetLocaleOverrides` — lifecycle hooks for locale-override tests. |
| `src/infrastructure/i18n/overrides.ts` | Underlying override registry the above functions manipulate. |
| `src/modules/shop/index.ts` | `startOfShopDay(dateStr)` converts a calendar date to the shop's local midnight for date fixtures. |
| `src/modules/products/repository.ts` | `productRepository` imported (available for direct data-seeding assertions if needed). |

## Notes

- The file deliberately **does not** assert the exact set of items a role can see — that is a service-level concern. Contract tests here only pin *shape* and *limit enforcement*.
- The `active` filter test is written to be **backend-agnostic**: it asserts the guarantee (stranger never sees inactive rows), not the merge mechanism (scope-overwrite vs. intersect-to-empty). A comment in the test explains this so the assertion isn't "fixed" to one implementation.
- 422 responses are expected to carry `application/problem+json` — this is the shared convention from `@infrastructure/http/schemas`, not a per-endpoint choice.
- The 49,990-byte nested-JSON test is an intentional **depth-limit** probe (stack-overflow guard), not a size-limit test; the expected status is 400, distinct from the 422 range.
- `productRepository` is imported but only referenced indirectly through the API; if a future test needs to seed data outside the factory, it is available without an additional import.
