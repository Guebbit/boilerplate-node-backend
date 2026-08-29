# src/modules/products/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the `/products` REST surface. They assert the wire-response shape against `openapi.yaml` (including `additionalProperties: false`) so that a field leaking into a payload is caught immediately. A small number of behavioural assertions are included solely to guarantee that each contract branch (scope, pagination, delete modes) is actually exercised — the behavioural "why" lives in unit/service suites.

## Key elements

- **`GET /products` suite** — validates the list response for anonymous, admin, empty, and paginated callers; rejects out-of-range `page`/`pageSize` with 422; treats blank values as absent (defaults applied).
- **`GET /products — the filters it now publishes`** — confirms `title` narrowing works and that a stranger requesting `?active=false` cannot retrieve inactive rows (scope invariant, mechanism-agnostic).
- **`POST /products/search`** — single contract-match assertion for the search endpoint.
- **`GET /products/{id}`** — contract match for 200 and 404 responses.
- **`DELETE /products/{id}`** — soft-delete default, `hardDelete=false` (string "false" must NOT be truthy), `hardDelete=true`, non-boolean rejection (422), and contradictory-source OR semantics (query + body).
- **`DELETE /products/{id}/hard`** — path-form hard-delete; verifies it wins over a contradictory `?hardDelete=false`.
- **`GET /products/categories`** — contract match; asserts only the public catalogue is counted.
- **`stored(id)`** (local helper) — calls `productRepository.findByIdRaw` to inspect the raw row, so soft-deleted products remain visible to assertions.

## Relationships

- **`tests/support/contract.ts`** — provides the `toSatisfyApiSpec()` matcher (aliased via `@tests/contract`) used on virtually every assertion.
- **`tests/support/http.ts`** — provides `api()` (supertest-style client) and `authenticateAs()` for bearer-token setup.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module load to prepare/teardown the test database.
- **`src/modules/products/tests/factory.ts`** — `createProduct()` seeds rows with configurable fields (title, active, categories, tags).
- **`src/modules/products/index.ts`** — exports `productRepository`, used by the local `stored()` helper for raw-collection reads.
- **`src/modules/products/repository.ts`** — the implementation under test (exercised through HTTP); `findByIdRaw` is the only direct method call.

## Notes

- **`hardDelete` boolean-from-string trap:** the test explicitly asserts that `?hardDelete=false` soft-deletes (the string `"false"` is truthy in a naïve "is the param present?" check). The endpoint must parse the *value*, not test for presence.
- **OR, not precedence, for contradictory sources:** when `hardDelete` is supplied in both query and body, `true` in either source triggers hard-delete. A `false` in one source must not cancel a `true` in the other.
- **`/hard` path is the strongest signal:** `DELETE /{id}/hard?hardDelete=false` still hard-deletes; the path expresses explicit intent that outranks the query.
- **Scope test is mechanism-agnostic:** the assertion checks that a stranger *cannot see* the inactive row, not *how* (merge-order overwrite vs. AND-clause). This keeps the test portable across backends.
- **Blank pagination ≠ invalid:** `?page=&pageSize=` is treated as "unspecified" (defaults 1/10), distinct from `page=0` or `page=abc` which are 422.
