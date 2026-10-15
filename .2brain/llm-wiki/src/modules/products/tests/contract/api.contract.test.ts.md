---
source: src/modules/products/tests/contract/api.contract.test.ts
sha256: 1eb94b07b3756836d0872d68a5e5e58954fa5a84ad259403827f457e15e1749d
generated_at: 2026-10-15T11:46:39.003489+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/products` endpoints. They validate the **shape** of wire responses against `openapi.yaml` (including `additionalProperties: false`) and assert that every filter, pagination, sort, and search parameter the contract publishes is actually enforced. Behavioural assertions (which products a role may see) live in the unit/service suites; this file exists so that each contract branch is exercised and so that a field leaking into a payload or a limit being silently ignored is caught here.

## Key elements

- **`setupTestDb()`** — called at module scope; initialises the test database before any test runs.
- **`describe('GET /products — the filters it now publishes')`** — exercises the `title` and `active` query filters and asserts a stranger cannot read past their visibility scope regardless of which filter is supplied.
- **`describe('GET /products')`** — validates contract shape for anonymous/admin/empty/paginated responses; enforces `422` for out-of-range pagination (`page=0`, `page=abc`, `pageSize=500`); treats blank pagination as absent; tests the batch `?id=` filter (repeated values, cap of 100, empty string → 422, duplicate collapse, one malformed id → 422); rejects search text over 200 characters.
- **`describe('POST /products/search')`** — validates contract shape; rejects `title`/`category`/`tag` over 200 chars; rejects bodies nested past the depth limit with `400`.
- **`describe('sort …')`** — verifies single/multi-field sort, descending `-` prefix, case-insensitive text sort, cross-page ordering consistency, CSV (query) vs array (body) parsing, blank-sort-as-absent, whitelist enforcement (`422`), and that body sort items must each be a single clean token.
- **`titlesOf`** (module-local helper) — extracts `body.data.items[].title` from a response for compact assertions.

## Relationships

- **`tests/support/contract.ts`** (`@tests/contract`) — imported for side effect; registers OpenAPI response validation so every `api()` call is automatically checked against `openapi.yaml`.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()` to create/tear down a per-file test database.
- **`tests/support/http.ts`** — provides the `api()` supertest-style client and `authenticateAs(role)` for bearer-token setup.
- **`tests/support/environment.ts`** — provides `withEnvironment` (imported, used for environment-scoped setup if needed).
- **`src/modules/products/tests/factories.ts`** — provides `createProduct()` to seed deterministic fixtures.
- **`src/modules/products/repository.ts`** — `productRepository` is imported; the tests indirectly exercise its query-building (filter merging, sort, pagination) through the HTTP layer.

## Notes

- The stranger-scope test deliberately asserts **the guarantee** (unlisted rows are hidden) rather than **the mechanism** (merge-order vs. clause-contradiction), so it stays valid across backends.
- Blank query-string values (`page=`, `pageSize=`, `sort=`) are treated as *absent*, not invalid — a form submitting an untouched field must not produce a `422`.
- The 200-character text limit and the `pageSize`/`page` range come from the shared OpenAPI schema (`shared/contracts/openapi.root.yaml`); the tests pin the `422` response, not the specific limit value, so a schema change is caught by the contract layer, not here.
- The nesting-depth guard returns **400** (not 422) because the body is rejected before it reaches parameter validation.
- Body `sort` is an array where each element must be exactly one token (e.g. `-title`); a CSV string inside a single array item is a `422`. Query-string `sort` accepts both CSV and repeated keys.
