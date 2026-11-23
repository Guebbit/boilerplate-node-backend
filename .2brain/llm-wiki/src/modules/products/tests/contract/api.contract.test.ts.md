---
source: src/modules/products/tests/contract/api.contract.test.ts
source_sha256: 4af9ffc06d747928d6daee63e0807867a7fe78b91aa0b38a365fa8dcb60a5dce
context_sha256: c9dfaef8ea01e5a427ea0aeaa1fd60b937616b1413c8ee44f117aed0a6303d31
generated_at: 2026-11-22T07:15:02.101014+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the `/products` endpoints. They check the shape of the wire response against `openapi.yaml`, including `additionalProperties: false`, which catches a field leaking into a payload. Behavioural rules, such as which products a role may see, live in the unit and service suites. These tests exist to make sure each contract branch is exercised.

## Key elements
- **`setupTestDb()`**: sets up the test database for the suite.
- **`GET /products — the filters it now publishes`**: covers the `title` and `active` filters. `title` narrows results for staff and strangers. For a stranger, `active=false` must not expose unlisted products. The test asserts only that the unlisted product is absent, not how the scope achieves that.
- **`GET /products`**: covers these cases:
  - anonymous and admin callers, an empty list, and pagination;
  - out-of-range or malformed `page` and `pageSize` return 422 with `application/problem+json`;
  - blank pagination is treated as absent, giving defaults `page=1` and `pageSize=10`;
  - repeated `?id=` works, but more than 100 ids returns 422;
  - an empty `id` returns 422;
  - a duplicated id collapses to one row;
  - one malformed id in a batch returns 422;
  - `text` over 200 characters returns 422.
- **`the browser re-checks the product reads`**: a guest `GET /products` returns `cache-control: public, no-cache`. `POST /products/search` returns 200 with `no-store`.
- **`POST /products/search`**: checks the contract, and that `title`, `category` and `tag` over 200 characters return 422 through both the body and the query string. A JSON body nested about 50k levels deep returns 400, not 500.
- **`promise dates on the list reads`**: `releaseDate` and `restockDate` are serialised as shop-day strings (`2999-01-05`, `2999-02-10`) on both `GET /products` and `POST /products/search`.
- **`titlesOf`**: local helper that returns the item titles of a list response in order.
- **`sort — ...`**: covers `?sort=` on GET and `{ sort }` on POST. Three products (banana, Apple, cherry) are seeded in `beforeEach`. Cases include `-` for descending, case-insensitive text sorting, and multi-field ordering. The shown content ends partway through the sort tests.

## Relationships
- `@tests/contract` is imported for its side effects, which enable the OpenAPI response validation.
- `@tests/setup-test-db`, `@tests/http` (`api`, `authenticateAs`) and `@tests/environment` (`withEnvironmentOverrides`) provide the DB, HTTP client, auth and environment helpers.
- `@modules/products/tests/factories` (`createProduct`) seeds products.
- `@modules/locales/tests/factories` (`givenLocale`), `@modules/locales` (`localeService`) and `@infrastructure/i18n` (`refreshLocaleOverrides`, `registerLocaleOverrideProvider`, `resetLocaleOverrides`) are imported for locale and i18n setup. The visible portion does not use them.
- `@modules/shop` provides `startOfShopDay`, used to build the promise-date fixtures.
- `../../repository` (`productRepository`) is imported but not used in the visible portion.

## Notes
- The `withEnvironmentOverrides`, locale, i18n and `productRepository` imports have no visible use in the shown portion. They are presumably used in the rest of the file.
- The comments reference a PHP twin implementation. The stranger-scope assertion is deliberately written so that it does not depend on how each backend enforces the scope.
- Pagination bounds and the 200-character text cap come from shared schemas (`@infrastructure/http/schemas` and `shared/contracts/openapi.root.yaml`). Other search endpoints inherit them.
- The depth-limit test expects the guard to reject the body before the response-cache key is built.
