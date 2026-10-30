---
source: tests/support/response-contract.ts
sha256: e669f029fdfd498f69b06ad39eecd935da08ead9eedf61f1db9f4b3c4004702f
generated_at: 2026-10-29T07:10:18.444846+00:00
model: ollama:qwen3.8:27b
---

# tests/support/response-contract.ts

## Purpose

Judges a single captured HTTP response against the exact Zod schema that `orval.config.ts` generates for that operation's documented status code. Enforces body shape, required headers, RFC 9457 problem-media-type, absence of nulls, and the "no body on 204/304" rule. Exists so both the shared `afterEach` contract runner and the fuzz suite can validate responses against `openapi.yaml` without re-deriving the logic.

## Key elements

- **`DECLARED_ROUTES`** (module-level const) — Every operation from the spec, pre-compiled to `{method, regex, operationId, paramCount}`. Built once at import time.
- **`REQUIRED_HEADERS`** (module-level const) — Per-operation, per-status list of headers the spec marks `required`, sourced from `spec-walk`.
- **`responseSchemaModule`** (module-level const) — `{ ...responseSchemas }` spread giving a runtime-indexable `Record<string, unknown>` view of the generated Zod schemas (avoids the namespace-import no-index-signature problem).
- **`operationFor(method, pathname)`** — Resolves a request to its `operationId`; picks the most specific match (fewest `{param}` segments) when a literal and a templated path both hit.
- **`schemaFor(operationId, status)`** — Looks up `${PascalCase(operationId)}${status}Response` in the schema module; returns `zod.ZodType` or `undefined`.
- **`assertProblemMediaType(response)`** — Throws if a 4xx/5xx with a JSON body is not `application/problem+json`. Skips `text/*` and empty bodies.
- **`nullPathsIn(value, at)`** *(exported)* — Recursively collects dotted paths of `null` values in a parsed JSON body.
- **`assertResponseMatchesContract(response)`** *(exported, main entry point)* — Orchestrates all checks: media-type, route resolution, status documentation, required headers, 204/304 body-empty, Zod `safeParse`, and null-absence. Throws a plain `Error` on any violation.

## Relationships

- **`tests/support/spec-walk.ts`** — Provides `listOperations`, `requiredResponseHeaders`, and the `HttpMethod` type used to build `DECLARED_ROUTES` and `REQUIRED_HEADERS`.
- **`tests/support/contract.ts`** — Calls `assertResponseMatchesContract` from a shared `afterEach` hook across the contract test suites.
- **`tests/fuzz/endpoints.fuzz.test.ts`** — Calls `assertResponseMatchesContract` directly inside each `fast-check` property function so mismatches shrink to the smallest failing input rather than surfacing from `afterEach`.
- **`src/modules/account/tests/contract/shop.contract.test.ts`** — Indirect consumer via `contract.ts`; exercises the shop endpoint's documented responses.
- **`tests/unit/support/response-contract.test.ts`** — Unit-tests the helpers in this file (route matching, null-path walking, media-type assertion).

## Notes

- **Undeclared paths return silently.** If `operationFor` finds no match, the function returns without throwing. Asserting a 404 envelope for unknown paths is the contract test's own responsibility.
- **`text/*` bodies bypass `.body`.** Superagent only populates `response.body` for JSON/urlencoded; a `text/plain` response (e.g., Prometheus exposition) lands in `.text`. The code selects the right field before `safeParse`.
- **204 / 304 special-case.** Their generated schemas are `void`/`unknown`, which would pass an empty `{}`. The check is instead `response.text === ''`.
- **Method casing.** Supertest reports the verb upper-case; `HttpMethod` and the spec walk use lower-case. The cast is safe because the app only issues the five methods the spec can declare.
- **`{...responseSchemas}` spread.** Required because TypeScript gives a fresh object literal an implicit index signature but not the namespace import itself—without the spread, computed-key lookup wouldn't type-check.
