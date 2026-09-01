# src/modules/products/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/products` REST surface. Every assertion calls `toSatisfyApiSpec()` to validate the wire response shape against `openapi.yaml` (including `additionalProperties: false`), and a smaller set of behavioural assertions verify that filter-scoping and delete-semantics invariants hold regardless of how the backend implements them.

## Key elements

- **`describe('GET /products — the filters it now publishes')`** – Asserts that `title` and `active` query filters narrow results for authenticated staff, and that a stranger's visibility scope cannot be overridden by explicitly requesting inactive rows.
- **`describe('GET /products')`** – Contract-shape checks for anonymous, admin, empty-list, and paginated responses; `it.each` block verifying out-of-range `page`/`pageSize` values return 422; a test confirming blank pagination params are treated as absent (defaults applied).
- **`describe('POST /products/search')`** – Contract-shape check for the search endpoint.
- **`describe('GET /products/{id}')`** – Contract-shape checks for a found and a missing (404) product.
- **`stored(id)` helper** – Wraps `productRepository.findByIdRaw(id)` so tests can inspect the raw collection row after a delete (sees soft-deleted rows).
- **`describe('DELETE /products/{id}')`** – Verifies soft-delete by default, `hardDelete=false` still soft-deletes (string `'false'` is truthy), `hardDelete=true` hard-deletes, non-boolean values return 422, and contradictory sources (query + body) resolve via OR.
- **`describe('DELETE /products/{id}/hard')`** – Path-based hard-delete; asserts the path form wins over a contradicting `?hardDelete=false` query param.
- **`describe('GET /products/categories')`** – Contract-shape check; also asserts only the public (active) catalogue is counted.

## Relationships

- **`tests/support/contract.ts`** – Imported as `@tests/contract`; registers the `toSatisfyApiSpec()` jest matcher that every contract assertion relies on.
- **`tests/support/http.ts`** – Provides `api()` (supertest wrapper) and `authenticateAs()` for building authenticated requests.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module scope to seed and isolate the test database.
- **`src/modules/products/tests/fixtures.ts`** – `createProduct()` inserts fixture rows for every test.
- **`src/modules/products/index.ts`** – Re-exports `productRepository`, which is used by the `stored()` helper to read raw rows post-delete.
- **`src/modules/products/repository.ts`** – The underlying repository whose `findByIdRaw` method the `stored()` helper delegates to.

## Notes

- **`hardDelete` string-truthiness:** The test `soft-deletes for hardDelete=false rather than destroying the record` documents that reading the query value as *presence* would treat the string `"false"` as truthy and hard-delete. The endpoint must parse the value, not just check presence.
- **OR, not precedence, for contradictory `hardDelete` sources:** A `true` in either query or body hard-deletes; an undecodable value in either source still 422s even if the other says `true`. The test suite pins both rules.
- **Path beats query:** `/products/{id}/hard?hardDelete=false` still hard-deletes—the URL is the more explicit intent.
- **Scope guarantee, not mechanism:** The stranger-filter test asserts the *result* (inactive rows are invisible) without asserting *how* (scope-merge vs. conjunctive clause), so the test is portable across backends that implement the guarantee differently.
- **`stored()` reads the raw collection:** It bypasses any soft-delete filter, which is why it can distinguish soft- from hard-delete after a DELETE call.
