---
source: tests/support/response-contract.ts
sha256: 8a7f068aa20f161a943b865bedf6a94c4d3200dbe0c086574ed12156c283d56e
generated_at: 2026-10-15T13:00:15.331913+00:00
model: ollama:qwen3.8:27b
---

# tests/support/response-contract.ts

## Purpose

Validates a captured HTTP response (from `supertest`) against the Zod schemas that `orval` generates from `openapi.yaml`. Each response is checked against the **exact** schema for its own status code, catching both undocumented status codes and body/shape mismatches. It throws a descriptive `Error` on contract violations rather than returning a result object.

## Key elements

- **`assertResponseMatchesContract(response: Response): void`** — The sole export. Resolves the operation from method + path, looks up the matching Zod schema, checks required headers, and `safeParse`s the body. Throws on any violation; silently returns for undeclared routes.
- **`DECLARED_ROUTES`** — Module-level array built once via `listOperations()`. Each entry carries a compiled regex (params → `[^/]+`), the `operationId`, and a `paramCount` for specificity tie-breaking.
- **`REQUIRED_HEADERS`** — Per-operation, per-status list of response headers the spec marks `required`, built once via `requiredResponseHeaders()`.
- **`operationFor(method, pathname)`** — Filters `DECLARED_ROUTES` for matches, then sorts by `paramCount` ascending so the most specific (fewest `{param}` segments) route wins. Returns `undefined` for undeclared paths.
- **`schemaFor(operationId, status)`** — Computes the export name (`PascalCase(operationId) + status + "Response"`), looks it up in `responseSchemaModule`, and narrows to `ZodType` via the `isZodType` guard.
- **`responseSchemaModule`** — `{ ...responseSchemas }` spread to obtain an implicit index signature, enabling runtime string-key lookup over the namespace import.
- **`pascalCase` / `isZodType`** — Small helpers for name computation and Zod type narrowing respectively.

## Relationships

- **`tests/support/contract.ts`** — Calls `assertResponseMatchesContract` inside a shared `afterEach` hook, giving every standard test file automatic response-shape validation.
- **`tests/fuzz/endpoints.fuzz.test.ts`** — Calls `assertResponseMatchesContract` directly once per generated request, *inside* the `fast-check` property function. This lets a mismatch trigger shrinking to the minimal failing input instead of surfacing asynchronously from an `afterEach`.
- **`tests/support/spec-walk.ts`** — Supplies `listOperations`, `requiredResponseHeaders`, and the `HttpMethod` type that drive route resolution and header checks here.

## Notes

- **204 handling:** A `204` must have an empty body (RFC 9110 §15.3.5). The check compares `response.text` to `''` rather than running the schema, because the generated schema is `void` and an empty `{}` parsed body would incorrectly fail.
- **Text responses:** `supertest`/`superagent` only populate `.body` for JSON or urlencoded responses. `text/*` responses (e.g., Prometheus exposition) land in `.text`; the code branches on `response.type.startsWith('text/')` to pick the right source.
- **Undeclared routes return silently:** A 404 for an unknown path is intentionally *not* a contract violation here — that assertion belongs to the dedicated 404-envelope test.
- **Route tie-breaking:** When both a literal path (e.g., `/cart/shipping-method`) and a templated sibling (`/cart/{productId}`) match, the fewer-param route wins. This mirrors the app's own Express mounting order.
- **`strict.response` in `orval.config.ts`:** Generated schemas use `.strict()`, so an extra field in the response body causes a parse failure rather than being silently stripped.
