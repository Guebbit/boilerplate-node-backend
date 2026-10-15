---
source: tests/support/spec-walk.ts
sha256: 6a0aa3b7614333097b3fe190ec4da0e215c8cc1c17a673499c723007888f973f
generated_at: 2026-10-15T13:02:52.024189+00:00
model: ollama:qwen3.8:27b
---

# tests/support/spec-walk.ts

## Purpose

Enumerates every operation declared in `openapi.yaml` and resolves the schema details the fuzzer needs to call it (path/query parameters, request-body schemas, auth flag, required response headers). The endpoint list is *derived* from the spec, never hardcoded, so adding a route to the YAML automatically extends fuzzer coverage with no bookkeeping. The file is deliberately scoped: it is not a general OpenAPI library and should not grow into one.

## Key elements

- **`HttpMethod`** — union type of the five HTTP verbs the walk scans for.
- **`SchemaNode`** — interface describing the subset of JSON Schema / OpenAPI 3.1 keywords the repo's spec actually uses (`type`, `format`, `enum`, bounds, `properties`, `items`, `oneOf`/`anyOf`/`allOf`, `$ref`, etc.).
- **`Operation`** — the fully-resolved shape of one endpoint: path, method, path/query parameters, required headers, body schemas (JSON and merge-patch), multipart flag, and `requiresAuth`.
- **`QueryParameter`** — a single resolved `in: query` parameter (name, required, schema).
- **`readSpec()`** — lazily parses and caches `openapi.yaml` (a ~120 KB document) so every test file shares one parse.
- **`resolveSchema(schema, spec?, seen?)`** — resolves `$ref`s into `components.schemas`, folds `allOf` and `oneOf: [X, {type:'null'}]` into a single flat node. Bounded by a `seen` set to prevent infinite recursion on self-referential schemas.
- **`isNullable(node)`** — checks whether a resolved node's `type` (string or array) includes `'null'`.
- **`requiredResponseHeaders(spec?)`** — walks every operation's responses and returns `{ operationId: { status: string[] } }` of required header names (lower-cased), used by shared `afterEach` assertions.
- **`mergeAllOf`** *(internal)* — folds an `allOf` array into one node; own siblings override, `properties` are merged, `required` is unioned.
- **`foldNullUnion`** *(internal)* — rewrites `oneOf: [X, {type:'null'}]` into `X` with `'null'` appended to its type array.
- **`parametersIn` / `queryParametersOf`** *(internal)* — resolve `$ref`d parameters from `components.parameters` and filter by location.
- **`requiredHeadersOf`** *(internal)* — resolves `components.headers` `$ref`s for a given response status.
- **`assertSpecVocabulary`** — tripwire that fails the test suite if the spec begins using a keyword this walk does not handle (e.g. `discriminator`, `callbacks`, `links`), preventing silent coverage gaps.

## Relationships

- **`tests/support/pattern-samples.ts`** — imported for `sampleForPattern` and `usesLookaround` (used when generating sample values for `pattern` constraints).
- **`tests/support/spec-arbitraries.ts`** — consumes `resolveSchema`, `Operation`, and `SchemaNode` to build fast-check arbitraries for each endpoint.
- **`tests/support/spec-world.ts`** — uses `readSpec()` / `Operation` to set up the shared test-world state.
- **`tests/support/spec-ids.ts`** — reads `Operation.pathParameters` and `pathParameterSchemas` to generate valid path IDs.
- **`tests/support/response-contract.ts`** — uses `requiredResponseHeaders()` to assert that documented status codes carry their required headers.
- **`tests/fuzz/endpoints.fuzz.test.ts`** — iterates over the operation list produced here to drive property-based fuzzing.
- **`tests/contract/request-contract.test.ts`** — consumes `Operation` and resolved schemas to validate request shapes.
- **`tests/integration/malformed-ids.test.ts`** — reads `Operation` entries to construct malformed-ID scenarios.
- **`tests/unit/spec-walk.test.ts`** — unit-tests the functions in this file directly (`resolveSchema`, `isNullable`, `readSpec`, etc.).
- **`package.json`** — provides the `yaml` dependency used for parsing and the `npm run contracts:bundle` script that produces `openapi.yaml`.

## Notes

- `SPEC_PATH` is resolved relative to `__dirname/../..`, i.e. the repo-root `openapi.yaml` produced by the `contracts:bundle` script. If the bundled spec is missing or stale, every consumer fails at load time.
- `readSpec()` caches the parsed document in a module-level `let`. Mutating the returned object in one test will corrupt it for all subsequent tests in the same process.
- `resolveSchema` returns `{ type: 'object' }` as a sentinel when it detects a cycle via the `seen` set; downstream code should not assume that object has `properties`.
- The doc comment explicitly warns: if the spec starts using `discriminator`, `callbacks`, or `links`, the correct response is to adopt a real OpenAPI tool rather than extending this file further. `assertSpecVocabulary` enforces that boundary at test time.
