---
source: src/modules/products/tests/contract/api.contract.test.ts
sha256: 3d0f69bf63a373072ae23d0044b2aa259ac71c3c70b44717975871a696a8819f
generated_at: 2026-09-23T19:29:05.579071+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/products` endpoints that validate the **shape** of HTTP responses (status code, headers, body schema including `additionalProperties: false`) against `openapi.yaml`. They do not assert *which* products a role sees (that lives in unit/service suites); their job is to guarantee the wire contract is exercised on every branch—anonymous, admin, empty list, paginated, error, and each filter variant—so a silently added or removed field is caught in CI.

## Key elements

- **`setupTestDb()`** — called at module top-level; initializes an isolated test database before any test runs.
- **`stored(id)`** (local helper) — reads a row directly via `productRepository.findByIdRaw`, used after `DELETE` to distinguish soft- vs hard-delete at the storage level.
- **`describe('GET /products — the filters it now publishes')`** — asserts that `title` filter narrows results and that a stranger requesting `active=false` cannot retrieve inactive rows (invariant, not mechanism).
- **`describe('GET /products')`** — the main contract block: anonymous/admin/empty/paginated responses, out-of-range pagination → 422, blank pagination → treated as absent, repeated `id` batch (accept, over-cap → 422, empty `id=` → 422, duplicate id collapses, one malformed id → 422).
- **`describe('POST /products/search')`** — single contract check that the body-based search endpoint returns the expected shape.
- **`describe('GET /products/{id}')`** — 200 for an existing product, 404 for a missing one; both must satisfy the spec.
- **`describe('DELETE /products/{id}')`** — soft-delete default, `hardDelete=true` removes the row, `hardDelete=false` preserves it, non-boolean value → 422. Nested `describe('hardDelete stated twice')` pins OR-semantics for contradictory query+body sources and confirms a malformed value in either source still yields 422.
- Every successful or error response is additionally asserted with **`toSatisfyApiSpec()`** (from `@tests/contract`).

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Imported for the `toSatisfyApiSpec()` jest matcher that validates responses against `openapi.yaml`. |
| `tests/support/http.ts` | Provides `api()` (supertest-style client) and `authenticateAs(role)` used in every request. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` resets and seeds the test database at module load. |
| `src/modules/products/tests/factories.ts` | `createProduct()` seeds rows with controlled `title` / `active` values. |
| `src/modules/products/repository.ts` | `productRepository.findByIdRaw(id)` is used by the local `stored()` helper to verify DB-level effect of DELETE without going through the API. |

## Notes

- **`hardDelete` presence-vs-value trap:** the comment in the file warns that reading the flag as *presence* (truthy string check) would make `?hardDelete=false` a hard delete. The tests pin the correct behaviour—parse the value, reject non-boolean with 422—so a regression to presence-checking fails CI.
- **OR, not precedence, for contradictory sources:** when `hardDelete` appears in both query and body with different values, the endpoint must OR them (either `true` wins) rather than letting the higher-priority transport override a legitimate `true`. The tests assert both orderings produce a hard delete.
- **Invariant over mechanism:** the stranger/`active` test deliberately does not assert *how* inactive rows are excluded (scope-merge-overwrite vs. AND-clause-empty-result), because different backends implement it differently. Changing the implementation is safe; breaking the guarantee is not.
- **Pagination contract:** out-of-range `page`/`pageSize` must return **422**, not be silently clamped. Blank (`?page=&pageSize=`) is treated as absent (defaults apply), not as invalid.
- **`id` batch filter:** validated as a widened array schema. One malformed element rejects the entire request (422); more than 100 elements → 422; duplicates collapse to a single row.
- The file is truncated in the provided content; the final `DELETE` sub-test (`still rejects an undecodable value…`) is cut off mid-assertion. The full file should be consulted for any additional sub-cases beyond what is listed here.
