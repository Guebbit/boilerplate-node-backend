---
source: tests/support/spec-walk.ts
sha256: d58a307b037b23b8b3bd6e19d7847be56dcaab4bebd90e27c8675bc4473f7520
generated_at: 2026-11-08T10:01:11.321823+00:00
model: ollama:qwen3.8:27b
---

# tests/support/spec-walk.ts

## Purpose

Enumerates every operation declared in `openapi.yaml` and resolves each one into the flat structure the spec-driven fuzzer needs (path, method, parameters, body schemas, auth flag). It exists so the endpoint list is *derived* from the spec on every run rather than hand-maintained, meaning a new route in the spec is automatically covered by the fuzzer without a separate test-file edit.

## Key elements

- **`readSpec()`** – Reads and YAML-parses `openapi.yaml` once; result is module-level cached so every test file shares a single parse of the ~120 KB document.
- **`Operation`** (type) – The resolved shape of one endpoint: path, method, path/query parameter names and schemas, required headers, `application/json` and `application/merge-patch+json` body schemas, `isMultipart`, and `requiresAuth`.
- **`SchemaNode`** (type) – The subset of JSON Schema / OpenAPI 3.1 keywords this repo actually uses (`type`, `allOf`, `oneOf`, `additionalProperties`, `exclusiveMinimum`, etc.).
- **`resolveSchema(schema, spec?, seen?)`** – Walks a schema node, resolving `$ref`s into `components.schemas`, folding `allOf` via `mergeAllOf`, collapsing `oneOf: [X, {type:'null'}]` into a nullable `X`, and recursing into `properties`, `items`, and `additionalProperties`. The `seen` set guards against self-referential schemas (e.g. a category tree).
- **`mergeAllOf(own, parts)`** – Merges `allOf` members with the owning node's sibling keywords. Siblings overwrite parts; `properties` are shallow-merged; `required` arrays are unioned.
- **`isNullable(node)`** (exported) – Returns `true` when the node's `type` (string or array) includes `'null'`.
- **`requiredHeadersOf(operation, status, spec)`** – Resolves the response for a given status (following `$ref` into `components.responses`), then returns the lower-cased names of headers marked `required: true` (following `$ref` into `components.headers`).
- **`parametersIn` / `queryParametersOf`** (internal) – Resolve `components.parameters` `$ref`s and filter by `in: query` or `in: path`.
- **`HttpMethod`** (type) – The five verbs the walk scans: `get`, `post`, `put`, `patch`, `delete`.

## Relationships

- **Depends on** `tests/support/pattern-samples.ts` – imports `sampleForPattern` and `usesLookaround` (used when building concrete values from regex `pattern` keywords).
- **Read by** the consumer test suites: `tests/contract/ownership-contract.test.ts`, `tests/contract/request-contract.test.ts`, `tests/cross-cutting/contract-responses-never-null.test.ts`, `tests/fuzz/endpoints.fuzz.test.ts`, `tests/integration/malformed-ids.test.ts` – all call `readSpec` / `resolveSchema` to obtain the operation list and schemas they assert against.
- **Sits alongside** the other spec-support modules (`spec-arbitraries.ts`, `spec-world.ts`, `spec-ids.ts`, `shopper-routes.ts`, `response-contract.ts`) which build on the `Operation` and `SchemaNode` types defined here.
- **Tested by** `tests/unit/support/spec-walk.test.ts`.
- **Reads** `openapi.yaml` (resolved relative to `tests/support/../../openapi.yaml`), the bundle produced by `npm run contracts:bundle`.

## Notes

- The spec path is computed from `__dirname` at module load; if the file is copied or run from a different working directory the path breaks silently (the read happens once, lazily, on first `readSpec()` call).
- `resolveSchema` returns `{ type: 'object' }` as a sentinel when a `$ref` cycle is detected (self-referential schema) instead of recursing infinitely. Downstream arbitrary builders must tolerate this degenerate node.
- `mergeAllOf` intentionally gives *sibling* keywords precedence over `allOf` members (the spec writes `type: string` next to an `allOf: [$ref]` wrapper for orval's benefit). Do not "fix" this to last-member-wins.
- The file's doc comment names `assertSpecVocabulary` as a tripwire that fails when the spec starts using a keyword the walk silently ignores (e.g. `discriminator`, `callbacks`, `links`). The design intent is to stay deliberately small; if a new OpenAPI feature is needed, reach for a real library rather than extending this walker.
- `exclusiveMinimum` / `exclusiveMaximum` follow the OpenAPI 3.1 numeric form (the bound value itself), not the OpenAPI 3.0 boolean form.
