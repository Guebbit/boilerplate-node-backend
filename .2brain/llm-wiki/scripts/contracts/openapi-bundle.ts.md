---
source: scripts/contracts/openapi-bundle.ts
sha256: b31c04e5d6596e0280e1787b557717cc8c610bfcffb81b4b96d3a40ee77edf14
generated_at: 2026-09-23T17:23:04.099447+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/openapi-bundle.ts

## Purpose

Compiles the project's REST OpenAPI contract from per-module standalone YAML documents into a single `openapi.yaml`. It shells out to `redocly bundle` to resolve cross-file `$ref`s, then post-processes the result to inject shared default responses (429, 400/413/415) into every operation that hasn't declared its own. The output is a committed, generated artefact consumed by Spectral, Orval, and the client-collections generator.

## Key elements

- **`MODULE_SECTIONS`** — Ordered list of the 17 modules that each own a standalone `src/modules/<name>/openapi.yaml`. Order is the narrative order a caller meets paths and the order client collections group requests.
- **`SECTION_ORDER`** — `['system', ...MODULE_SECTIONS]`; adds the shell (`GET /`) which lives in the root document rather than a module folder.
- **`moduleSpec(section)`** — Resolves the filesystem path to a module's `openapi.yaml`.
- **`sectionPaths(section)`** — Returns all paths a section declares. For modules this is a textual regex (`^ {4}(\/\S*):\s*$`); for `system` it parses the root YAML and filters out `$ref` entries.
- **`withAppLevelResponses(bundled: string): string`** — Parses the bundled YAML, merges the root's `x-app-level-responses` map into every operation's `responses` (never overwriting an existing status code), deletes the `x-app-level-responses` key, and re-serialises with `lineWidth: 0`.
- **`compile()`** (internal) — Memoised. Runs `redocly bundle` against `openapi.root.yaml`, reads the output file, prepends a "DO NOT EDIT" marker, and applies `withAppLevelResponses`.
- **`openapiBundle`** — The `CompiledBundle` record (name, label, output path, `content: compile`, `sources`) exported for the bundle registry.

## Relationships

- **`scripts/contracts/bundle-kinds.ts`** — Provides the `REPO_ROOT` constant and the `CompiledBundle` type that `openapiBundle` conforms to.
- **`scripts/contracts/bundle-registry.ts`** — Consumes the `openapiBundle` export to register the contract in the project-wide bundle pipeline.
- **`scripts/contracts/client-collections-bundle.ts`** — Calls `sectionPaths` and `SECTION_ORDER` to group generated HTTP client requests by owning section.
- **`shared/contracts/openapi.root.yaml`** — The input to `redocly bundle`; source of the shared `components`, the `GET /` shell path, and the `x-app-level-responses` map that `withAppLevelResponses` reads and then strips.
- **`tests/unit/scripts/contracts/openapi-bundle.test.ts`** — Unit tests for `withAppLevelResponses`, `sectionPaths`, and the compile flow.
- **`tests/cross-cutting/contract-bundles.test.ts`** — Exercises all registered bundles (including this one) for consistency invariants.
- **`src/modules/account/tests/unit/two-factor.test.ts`** — Exercises account-module API paths whose contract is defined in `src/modules/account/openapi.yaml`, a source this file bundles.

## Notes

- `compile()` is memoised in a module-level `let compiled`. A single process run (which may call `content` two or three times) triggers `redocly` exactly once.
- `withAppLevelResponses` never overwrites a status code the operation already declares — it only fills gaps. An operation with its own `429` (e.g. a per-route rate-limit with custom `Retry-After`) is left untouched.
- `appliesTo: 'requestBody'` checks for the presence of the `requestBody` field on the operation, not the HTTP method. A `DELETE` with a body gets the size-error defaults; a `GET` does not.
- The "DO NOT EDIT" marker is prepended _after_ bundling because `redocly` strips comments from source files during parsing.
- `lineWidth: 0` in the YAML re-serialisation prevents unstable line-wrapping from producing noisy diffs on every regeneration.
- `sectionPaths` for modules uses a regex on raw text rather than YAML parsing — deliberately, since it is called for every path on every collection regeneration and only needs the path-key strings.
