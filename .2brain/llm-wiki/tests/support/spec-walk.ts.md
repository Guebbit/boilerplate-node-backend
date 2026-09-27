---
source: tests/support/spec-walk.ts
sha256: d2e30a768bcaaa56a36f0850118e548e9b6c5846d642a8379c4f5c09f6d0bd7c
generated_at: 2026-09-27T16:01:35.061170+00:00
model: ollama:qwen3.8:27b
---

# tests/support/spec-walk.ts

## Purpose

Enumerates every HTTP operation declared in `openapi.yaml` and resolves its schemas into a flat structure the fuzzing and contract test suites can consume. The endpoint list is derived from the spec at test time rather than hardcoded, so adding a route to the spec automatically extends coverage. The file is deliberately scoped to the subset of JSON Schema/OpenAPI the repo actually uses and includes two tripwire functions (`unsupportedKeywords`, `ungeneratablePatterns`) that fail tests if the spec grows vocabulary this walker silently ignores.

## Key elements

- **`HttpMethod`** — union type of the five HTTP verbs the walker enumerates.
- **`SchemaNode`** — interface for the JSON Schema subset this repo's spec uses (type, constraints, composition keywords, `$ref`).
- **`Operation`** — one endpoint with its path, method, path parameters, resolved query parameters, resolved body schema, `isMultipart` flag, and `requiresAuth` flag.
- **`QueryParameter`** — a single `in: query` parameter with name, required flag, and resolved schema.
- **`readSpec()`** — reads and caches `openapi.yaml` (one-time parse of ~120 KB YAML).
- **`resolveSchema()`** — resolves `$ref` into `components.schemas` and flattens `allOf`; uses a `seen` set to break self-referential cycles.
- **`listOperations()`** — walks `spec.paths` × methods, assembles every `Operation`, resolving parameters and body schemas.
- **`SUPPORTED_KEYWORDS`** — a `Set` of every JSON Schema keyword this walker honours (including documentation-only keys like `description`, `example`).
- **`unsupportedKeywords()`** — returns any schema keyword present in the spec but missing from `SUPPORTED_KEYWORDS`; empty means the spec is safe for this walker.
- **`ungeneratablePatterns()`** — returns `pattern` values that use lookaround and have no registered sample in `pattern-samples.ts`; these would cause the fuzzer to omit the field.

## Relationships

- **`tests/fuzz/endpoints.fuzz.test.ts`** — primary consumer; calls `listOperations()` to get the endpoint list and passes `Operation` objects into the fuzzer.
- **`tests/contract/request-contract.test.ts`** — consumes `listOperations()` to drive contract tests across all spec-declared operations.
- **`tests/support/spec-arbitraries.ts`** — imports `SchemaNode` and `Operation` to build `fast-check` arbitraries from the resolved schemas.
- **`tests/support/pattern-samples.ts`** — imported directly; `sampleForPattern` and `usesLookaround` are used by `ungeneratablePatterns()` to detect patterns no generator can satisfy.
- **`src/modules/audit-logs/service.ts`** — the service whose endpoints appear in `openapi.yaml` and are therefore enumerated here.
- **`package.json`** — provides the `yaml` runtime dependency used by `readSpec()`.

## Notes

- The spec file path is resolved relative to `__dirname` as `../../openapi.yaml`; it will not work if the file is moved out of `tests/support/`.
- `readSpec()` caches in a module-level `let`; there is no invalidation mechanism. If the spec file changes at runtime (it doesn't in practice), the cache would be stale.
- `resolveSchema` breaks cycles by returning `{ type: 'object' }` for a re-encountered ref name. This is a deliberate approximation, not a faithful resolution.
- `allOf` flattening only merges `properties` and `required`; other keyword-level interactions (e.g. `allOf` with `enum` constraints) are not handled and would be silently dropped.
- `childSchemasOf` is structural on purpose: it only recurses into known schema-bearing slots (`properties` values, `items`, `additionalProperties`, `oneOf`/`anyOf`/`allOf` arrays) so that field *names* inside `properties` are never mistaken for schema keywords.
- The file is explicitly not a general OpenAPI library. The doc comment names the trip: if `discriminator`, callbacks, or links are needed, the project should adopt a real library rather than extending this file.
