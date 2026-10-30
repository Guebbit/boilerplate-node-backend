---
source: tests/contract/request-contract.test.ts
sha256: a3252dd9259044f62db1a8b78121fd9a0766b42c11a74d8fa1a3b3c8539d2155
generated_at: 2026-10-29T06:40:26.781473+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/request-contract.test.ts

## Purpose

Contract-derived **request** tests: for every write endpoint, does the API accept every payload its own OpenAPI spec declares legal (expect 2xx) and reject exactly what it declares illegal (expect 422 + `Problem` body)? Also sweeps every `in: query` parameter constrained by `enum` or `pattern` for a 422 on a violating value. This is the mirror image of the response-contract tests — instead of comparing a real response to the spec, it sends spec-derived requests at the real API.

## Key elements

- **`QUERY_FIXTURES`** – Maps each operation key (`"METHOD /path"`) to a `QueryFixture` (a `request(query)` function) that hits the route over real HTTP with admin auth (or public, for locale messages).
- **`QUERY_CASES`** – Derived from `listOperations()`; every (operation, parameter) pair whose schema declares `enum` or `pattern`.
- **`invalidQueryValue(schema)`** – Produces a single string that violates the schema's `enum` or `pattern`.
- **`KNOWN_GAPS`** – Set of `"operation::param"` pairs where a 422 is intentionally *not* expected (e.g. `GET /locales/{locale}/messages::app` answers 404 by design to avoid leaking draft-translation existence).
- **`adminQuery` / `adminQueryWith`** – Higher-order helpers that return a GET-request function with admin Bearer auth; `adminQueryWith` prepends required base query params.
- **`withRealLocale()`** – Seeds a `'qp'` locale row via `givenLocale` so locale-parameterized routes reach validation instead of 404-ing.
- **`STRICT_2XX`** – Operations (`createUser`, `createProduct`, `createOrder`, etc.) whose legal body must return a 2xx, not merely "not 422".
- **`WRITE_OPERATIONS`** – All POST/PUT/PATCH operations with a JSON `bodySchema`, walked from `listOperations()`.
- **`zodBodyOf(operation)`** – Resolves the operation's generated Zod body schema from `@api/schemas.zod` by orval naming convention (`{OperationId}Body`).
- **`RECORD_BODIES`** – Operations whose Zod schema is a `z.record(...)`, which `contract-data.ts` cannot auto-generate; a hand-written legal body is used instead.
- **`describe('invalid query parameters (contract-derived)')`** – Two tests: a meta-test asserting `QUERY_FIXTURES` covers every case in `QUERY_CASES`, and an `it.each` sweep asserting 422 on each violation (minus `KNOWN_GAPS`).
- **Truncated write-operations section** – Iterates `WRITE_OPERATIONS`, calling `validPayload` / `invalidPayloads` from `contract-data.ts` to send legal and illegal bodies.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Side-effect import (`import '@tests/contract'`) — likely registers global test helpers or config. |
| `tests/support/contract-data.ts` | `validPayload()` / `invalidPayloads()` generate legal and illegal request bodies from the spec. |
| `tests/support/http.ts` | `api()` (supertest instance) and `authenticateAs()` (role-based Bearer token). Importing this module boots the real app. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the in-memory test database. |
| `tests/support/shopper-routes.ts` | `roleReaching` helper for role-based auth scenarios. |
| `tests/support/spec-walk.ts` | `listOperations()`, `Operation`, `SchemaNode`, `isNullable` — walks `openapi.yaml` to enumerate operations, parameters, and schemas. |
| `tests/support/spec-world.ts` | `seedWorld()`, `buildUrl()`, `requiredHeadersOf()`, `OBJECT_ID` — seeds deterministic test data and constructs request URLs/headers. |
| `src/modules/locales/tests/factories.ts` | `givenLocale('qp')` creates a real locale row so locale routes validate rather than 404. |
| `src/modules/users/tests/factories.ts` | `PLAIN_PASSWORD` constant used when creating/authenticating test users. |

## Notes

- The top-of-file JSDoc documents **four recurring mechanisms** that cause validator–spec drift (spec format mismatch on `imageUrl`, `.extend()` silently replacing fields, coercion running before validation, and validating only a `.pick()` subset). Each names the correct fix, which is not always "tighten the validator."
- A **meta-test** inside the query-parameter `describe` block enforces that `QUERY_FIXTURES` has an entry for every operation in `QUERY_CASES`; adding a new enum/pattern query param to the spec without a fixture fails this test.
- `import '@tests/http'` is a **side-effect import**: it boots the full application, which registers every enabled module's translatables. This file therefore runs against a live app, not a mock.
- Generated payloads are **additive**; deterministic scenario tests continue to use hand-written module factories. This file answers "does the API honour its own contract for *any* legal input," not "does this specific scenario behave correctly."
- `invalidQueryValue` tries a short candidate list for `pattern` violations rather than computing a full regex negation; it throws a descriptive error if all candidates happen to satisfy the pattern.
