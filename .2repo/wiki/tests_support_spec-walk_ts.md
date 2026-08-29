# tests/support/spec-walk.ts

## Purpose

Derives the full list of HTTP operations (and their schemas) directly from `openapi.yaml`, so the fuzz test suite automatically covers every route the spec declares without anyone manually maintaining an endpoint list. It is intentionally limited to the schema subset this repo actually uses and is *not* a general OpenAPI parser.

## Key elements

- **`readSpec()`** — Reads `openapi.yaml` from the repo root, parses it with `yaml`, and caches the result in a module-level variable. All other exports call this by default.
- **`resolveSchema(schema, spec, seen)`** — Recursively resolves `$ref` pointers against `components.schemas` and flattens `allOf` composites into a single `SchemaNode`. The `seen` set (a `Set<string>`) guards against self-referential schemas that would otherwise stack-overflow.
- **`listOperations(spec)`** — Iterates `spec.paths` × known HTTP methods and returns an `Operation[]` in document order. Each entry captures the path, method, path-parameter names (regex-extracted), the resolved JSON body schema, whether the body is `multipart/form-data`, whether a security scheme is declared, and the documented response status codes.
- **`SUPPORTED_KEYWORDS`** — A frozen `Set` of every JSON Schema keyword the walk understands (including documentation-only keys like `description`, `example`). Used as the allow-list by the tripwire below.
- **`unsupportedKeywords(spec)`** — Structurally walks every schema under `components.schemas` and reports any key *not* in `SUPPORTED_KEYWORDS`. Designed to be called from a test so the suite goes red the moment the spec adopts a keyword the fuzzer silently ignores.
- **Types** — `HttpMethod`, `SchemaNode`, `Operation`, `SpecDocument` form the small type surface the rest of the test infrastructure imports.

## Relationships

- **`tests/fuzz/endpoints.fuzz.test.ts`** — Primary consumer. Calls `listOperations` to enumerate targets and `resolveSchema`/`readSpec` to obtain schemas for building test inputs.
- **`tests/support/spec-arbitraries.ts`** — Consumes the `SchemaNode` and `Operation` types (and the resolved schema from `resolveSchema`) to construct fast-check arbitraries that generate valid request bodies and path parameters.
- **`package.json`** — Provides the `yaml` runtime dependency and the `test` / `fuzz` npm scripts that invoke the test files above.

## Notes

- **Deliberate scope ceiling.** The header comment states the rule: if the spec starts using `discriminator`, callbacks, links, etc., the correct response is to adopt a real OpenAPI tool, *not* to extend this file.
- **Multipart flag.** Operations with a `multipart/form-data` body are tagged `isMultipart: true` and expected to be skipped downstream by the fuzzer (binary bodies are out of scope for schema-driven generation).
- **`unsupportedKeywords` is structural, not key-flattening.** The keys under `properties` are field *names*, not schema keywords. The walker only inspects keys at schema-node level and recurses into values where they are themselves schemas. A naive "check every object key against the keyword list" approach was the first-version bug that reported the entire domain model as unsupported.
- **`resolveSchema` copies the `seen` set on each branch** (`new Set(seen)`) so sibling sub-schemas don't share a false "already seen" state, while the path from root to a given node still detects cycles.
- **Cache is process-lifetime.** `cached` is a module-level `let`; it is never invalidated. This is safe because the spec file is static during a test run, but a watch-mode tool that re-imports the module in the same process would need a page reload.
