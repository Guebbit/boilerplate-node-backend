---
source: tests/contract/request-contract.test.ts
sha256: e3e6b2cb9d1119fbae031ffe597b93517e9b2319f2673fa106230545d74b5e84
generated_at: 2026-11-08T09:20:55.048284+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/request-contract.test.ts

## Purpose

Contract-derived **request** tests: for every write endpoint the OpenAPI spec declares, this file verifies the API accepts every payload the spec declares legal (2xx) and rejects every payload the spec declares illegal (422). It is the mirror image of the sibling `tests/contract/*` files, which compare real responses against the spec; here the spec is the source of the *inputs*. It also sweeps every `in: query` parameter constrained by `enum` or `pattern` and asserts a violating value yields 422. Generated test data is used so the suite stays exhaustive as the spec evolves.

## Key elements

- **`adminQuery` / `adminQueryWith`** – Build admin-authenticated GET/DELETE requests with a query string appended; `adminQueryWith` additionally prepends a base query for operations with required parameters.
- **`withRealLocale`** – Seeds a locale row (`qp`) via `givenLocale` so locale-scoped endpoints reach their own validation instead of 404ing on an unknown tag.
- **`QUERY_FIXTURES`** – `Partial<Record<string, QueryFixture>>` mapping each operation key (`"METHOD /path"`) to a request function tailored to its auth and required parameters.
- **`KNOWN_GAPS`** – A `Set` of `"operation::param"` pairs where a spec violation intentionally does **not** return 422 (documented with the reason, e.g. `GET /locales/{locale}/messages::app` returns 404 to avoid leaking existence).
- **`invalidQueryValue(schema)`** – Produces one string that violates the schema's `enum` or `pattern`; throws if neither is present or no candidate is rejected.
- **`QUERY_CASES`** – Flattened list of every `(operation, query-parameter)` pair that carries an `enum` or `pattern` constraint, derived from `listOperations()`.
- **`STRICT_2XX`** – Set of operationIds whose valid (relinked) body must be answered 2xx, not merely "not refused."
- **`WRITE_OPERATIONS`** – All POST/PUT/PATCH operations that have a `bodySchema`, pulled from `listOperations()`.
- **`zodBodyName` / `zodBodyOf`** – Derive the generated Zod schema name from an `operationId` (e.g. `createUser` → `CreateUserBody`) and look it up in `@api/schemas.zod`.
- **`describe('invalid query parameters …')`** – Asserts fixture coverage for every query-constrained operation, then `it.each` over `QUERY_CASES` (minus `KNOWN_GAPS`) expecting 422.
- The (truncated) lower half walks `WRITE_OPERATIONS`, generating valid/invalid payloads via `validPayload` / `invalidPayloads` and asserting 2xx / 422 respectively.

## Relationships

- **`tests/support/contract.ts`** – Side-effect import (`@tests/contract`); boots the real app and registers module `translatables`.
- **`tests/support/contract-data.ts`** – Source of `validPayload` and `invalidPayloads`, the spec-derived payload generators for the write-operation sweep.
- **`tests/support/spec-walk.ts`** – `listOperations`, `isNullable`, `Operation`, `SchemaNode`; walks `openapi.yaml` to enumerate operations and their parameter/body schemas.
- **`tests/support/spec-world.ts`** – `seedWorld`, `buildUrl`, `requiredHeadersOf`, `OBJECT_ID`, `World`; provides the seeded test world and URL construction for write-operation requests.
- **`tests/support/http.ts`** – `api` (supertest agent) and `authenticateAs`; the real-HTTP transport for every assertion.
- **`tests/support/setup-test-db.ts`** – `setupTestDb`; called at module top to prepare a clean database per test run.
- **`tests/support/shopper-routes.ts`** – `roleReaching`; used to pick a role/credential that can reach a given route.
- **`src/modules/locales/tests/factories.ts`** – `givenLocale`; seeds a minimal locale row so locale-path endpoints pass the tag-existence check.
- **`src/modules/users/tests/factories.ts`** – `PLAIN_PASSWORD`; the canonical password used when creating a user fixture for auth.

## Notes

- The top-of-file comment block documents **four concrete mechanisms** that cause validator/spec drift in this codebase (relative `ImageUrl` paths, `.extend()` field replacement, coercion-before-validation, and partial `.pick()` validation). Each is named so future readers know *why* the test exists and *which* side to fix.
- `invalidQueryValue` deliberately tries a short list of garbage candidates rather than attempting to generically negate an arbitrary regex; it throws with a clear message if all candidates happen to satisfy the pattern.
- The `@tests/contract` import is a **side-effect** import — it does not bind a value but ensures the app is booted before any `api()` call runs.
- `KNOWN_GAPS` entries are verified-live exceptions, not TODOs; each carries a one-line justification for why 422 is the wrong expectation.
- The file is truncated in the provided content; the write-operation sweep (the `describe` block covering `WRITE_OPERATIONS` with `validPayload`/`invalidPayloads`) is referenced but not fully visible.
