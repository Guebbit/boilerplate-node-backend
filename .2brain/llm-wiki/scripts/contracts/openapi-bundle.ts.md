---
source: scripts/contracts/openapi-bundle.ts
sha256: c383709051453e4519a825c62e89f24dbe76c0104dd0b45078de35225874effc
generated_at: 2026-09-27T13:53:30.849929+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/openapi-bundle.ts

## Purpose

Compiles the project's REST API contract into a single `openapi.yaml` by running `redocly bundle` over the root document (`shared/contracts/openapi.root.yaml`) and every module's standalone `openapi.yaml`, then post-processes the result to merge app-level default responses (429, body-size errors) into every operation that doesn't declare its own. Exports the result as a `CompiledBundle` so the shared bundle registry and downstream consumers (client collections, tests) get one canonical contract.

## Key elements

- **`MODULE_SECTIONS`** — Ordered list of the 16 modules that each own a standalone `openapi.yaml` under `src/modules/<name>/`. Order is the narrative/customer-flow order and also the order client collections group requests in.
- **`SECTION_ORDER` / `SectionName`** — `MODULE_SECTIONS` prefixed with `'system'` (the shell's own paths, written directly in the root doc). Used by anything that groups paths by owner.
- **`moduleSpec(section)`** — Resolves the filesystem path to a module's `openapi.yaml`.
- **`sectionPaths(section)`** — Returns every path a section declares, in declaration order. For `'system'` it parses the root and keeps only non-`$ref` entries; for modules it uses a fast regex (`PATH_LINE`) on raw text.
- **`withAppLevelResponses(bundled)`** — Parses the bundled YAML, walks every operation, injects missing responses from the root's `x-app-level-responses` map (never overwriting existing ones), deletes the map from the output, and re-stringifies with `lineWidth: 0`.
- **`compile()`** — Memoized. Shells out to `@redocly/cli bundle` writing to `node_modules/.cache/openapi.bundle.yaml`, reads it back, prepends a generated-file marker comment, and applies `withAppLevelResponses`.
- **`openapiBundle`** — The exported `CompiledBundle` descriptor (`name`, `output` path, `compiled: true`, `content: compile`, `sources()`).

## Relationships

- **`scripts/contracts/bundle-kinds.ts`** — Provides `REPO_ROOT` and the `CompiledBundle` type that `openapiBundle` conforms to.
- **`scripts/contracts/bundle-registry.ts`** — Consumes `openapiBundle` (and the other bundle descriptors) to coordinate generation and staleness checks across all contract artifacts.
- **`scripts/contracts/client-collections-bundle.ts`** — Runs after the OpenAPI bundle; calls `compile()` (via the registry) to read a current contract and to use `SECTION_ORDER` / `sectionPaths` when grouping and ordering requests.
- **`shared/contracts/openapi.root.yaml`** — The root document that `redocly bundle` resolves `$ref`s against; also the source of `x-app-level-responses` and the `system` section's paths.
- **`tests/unit/scripts/contracts/openapi-bundle.test.ts`** — Unit tests exercising `sectionPaths`, `withAppLevelResponses`, and the bundle output shape.
- **`tests/cross-cutting/contract-bundles.test.ts`** — Cross-cutting tests that validate all registered bundles together (including this one) for consistency.
- **`src/modules/account/tests/unit/two-factor.test.ts`** — Lives in the `account` module, one of the `MODULE_SECTIONS`; its module's `openapi.yaml` is a source that `compile()` bundles.

## Notes

- `compile()` is memoised at module level (`let compiled`). All callers in a single process get the same string; re-running requires a fresh process.
- The "do not edit" marker is **prepended** after bundling, not authored in a source file, because `redocly` parses (and discards) comments.
- `lineWidth: 0` in the final `stringifyYaml` call prevents line-folding, which would cause noisy diffs on unrelated changes.
- `withAppLevelResponses` is **additive only**: an operation that already declares a given status code (e.g. a route-specific 429 with custom `Retry-After`) is never overwritten.
- `appliesToOperation` checks for the presence of `requestBody` on the operation rather than inferring from the HTTP method, because `DELETE` (and other methods) can legitimately carry a body.
- The temporary bundle file lands in `node_modules/.cache/` and is read back via `readFileSync` rather than captured from stdout, to avoid redocly's progress text corrupting the YAML.
- `PATH_LINE` is a raw-text regex (not a YAML parse) deliberately: `sectionPaths` is called on every collection regeneration for every path, and the answer is a property of *which file* contains the line, not of the parsed document.
