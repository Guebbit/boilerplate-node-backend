---
source: tests/support/response-contract.ts
sha256: dad19f16e15daee13de3d1952f33a20396237fbcf1e63217389c84834b6a1c51
generated_at: 2026-11-08T09:58:29.383836+00:00
model: ollama:qwen3.8:27b
---

# tests/support/response-contract.ts

## Purpose

Validates a single captured HTTP response against the Zod schemas orval generates from `openapi.yaml`. Given a `supertest` `Response`, it resolves the matching operation, looks up the exact per-status schema, and asserts the body shape, required headers, media type (RFC 9457), and absence of `null` values all conform to the spec.

## Key elements

- **`assertResponseMatchesContract(response)`** *(exported)* — Main entry point. Throws a plain `Error` on any contract violation (undocumented status, body mismatch, missing required header, wrong content-type, stray `null`). Returns silently for undeclared routes (404-envelope tests own that concern).
- **`nullPathsIn(value, at?)`** *(exported)* — Recursively walks a parsed JSON body and returns dotted paths where the value is `null`.
- **`isPackedRuleOperand(operationId, path)`** *(exported)* — Whitelists `deletedAt: null` inside Mongo query conditions on session-answer operations (`login`, `getAccount`, `refreshToken`, etc.) where `null` is a legitimate operand, not a reported value.
- **`operationFor(method, pathname)`** — Matches a request's method + path against `DECLARED_ROUTES`; breaks literal-vs-templated ties by preferring the fewer-parameter (more specific) route.
- **`schemaFor(operationId, status)`** — Dynamically resolves the generated Zod schema (e.g. `Login200Response`) from the spread module.
- **`assertProblemMediaType(response)`** — Enforces that 4xx/5xx JSON bodies use `application/problem+json`.
- **`DECLARED_ROUTES` / `REQUIRED_HEADERS`** — Module-level constants built once from `spec-walk`; the spec is static during a test run.
- **`responseSchemaModule`** — `{ ...responseSchemas }` spread that gives an implicit index signature so schemas can be looked up by a runtime-computed name.

## Relationships

- **`tests/support/spec-walk.ts`** — Provides `listOperations`, `requiredResponseHeaders`, and the `HttpMethod` type consumed at module load.
- **`tests/support/contract.ts`** — Calls `assertResponseMatchesContract` from a shared `afterEach` hook so every route test gets the check for free.
- **`tests/fuzz/endpoints.fuzz.test.ts`** — Calls the same function inline inside each `fast-check` property, so a mismatch surfaces and shrinks within the property rather than from an unrelated `afterEach`.
- **`tests/unit/support/response-contract.test.ts`** — Unit tests exercising this module's helpers directly.

## Notes

- **Route specificity tie-break:** A literal path (e.g. `/products/search`) and its templated sibling (`/products/{id}`) can both regex-match the same URL. The route with the fewest `{param}` segments wins, mirroring how the Express router mounts the literal first.
- **204 / 304:** These statuses must have an empty body (RFC 9110). The check is `response.text === ''` rather than a schema parse, because superagent would leave `.body` as `{}` which wouldn't fairly validate against a `void` schema.
- **`text/*` bodies:** superagent populates `.text` (not `.body`) for text responses like the Prometheus exposition; the code branches on `response.type` before parsing.
- **Null policy:** A response must never contain `null`; an unset field is simply absent. The single exception is the `deletedAt` operand in packed permission rules on session endpoints, where `null` means "is unset" in a Mongo query.
- **Method casing:** Node's `http` reports the verb upper-case; the file lowercases it to match the `HttpMethod` union used throughout `spec-walk`.
