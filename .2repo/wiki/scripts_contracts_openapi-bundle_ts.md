# scripts/contracts/openapi-bundle.ts

## Purpose

Compiles the project's REST API contract (`openapi.yaml`) by running `redocly bundle` over a shared root document and per-module standalone OpenAPI files, resolving cross-file `$ref`s. It exists so the contract is assembled by reference resolution rather than textual concatenation, preserving the authored comments that live in module files.

## Key elements

- **`MODULE_SECTIONS`** — Ordered tuple of module names (`locales` … `inventory`) whose `src/modules/<name>/openapi.yaml` files contribute to the bundle. Order is the narrative/customer-journey order and matches client-collection grouping.
- **`SECTION_ORDER` / `SectionName`** — All groupable sections: `system` (shell paths owned by root) plus every module.
- **`moduleSpec(section)`** — Returns the filesystem path to a module's standalone `openapi.yaml`.
- **`sectionPaths(section)`** — Returns the list of URL paths a section declares, in declaration order. For `system`, parses the root YAML and keeps non-`$ref` entries; for modules, regex-matches four-space-indented path keys (intentionally textual for speed).
- **`compile()`** *(internal, memoised)* — Invokes `redocly bundle` via `execFileSync` writing to `node_modules/.cache/openapi.bundle.yaml`, prepends a two-line `DO NOT EDIT` marker, and caches the result.
- **`openapiBundle`** — The `CompiledBundle` descriptor (name, label, output path, `compiled: true`, `content: compile`, `sources` listing root + all module specs) that registers this contract with the bundle system.

## Relationships

- **`scripts/contracts/bundle-kinds.ts`** — Provides the `CompiledBundle` type and the `REPO_ROOT` constant used throughout this file.
- **`scripts/build-contract-bundles.ts`** — Orchestrator that iterates registered bundles and calls `content()` (i.e. `compile()`) to produce the committed artefact.
- **`scripts/contracts/client-collections-bundle.ts`** — Consumes the compiled contract in a second phase of the build; the memoisation in `compile()` avoids re-running redocly for that read.
- **`scripts/contracts/bundle-registry.ts`** — Central registry where `openapiBundle` is registered alongside other bundle descriptors.
- **`tests/cross-cutting/contract-bundles.test.ts`** — Cross-cutting test that exercises the bundle pipeline, including this OpenAPI contract.
- **`docs/theory/modules.md` / `docs/theory/module-lifecycle.md`** — Document the module-folder convention (`src/modules/<name>/openapi.yaml`) and the lifecycle (create/delete) that this file's path layout assumes.

## Notes

- **Memoisation is load-bearing.** `compile()` is called more than once per build (staleness check → write → client-collections read). Without the `compiled` cache, redocly would run three times and the log would look broken.
- **Marker is prepended, not authored.** Redocly drops YAML comments during parsing, so the `DO NOT EDIT` header must be concatenated *after* the bundle is produced. The two comment lines are valid YAML and are read past by spectral, orval, and AsyncAPI-style viewers.
- **`sectionPaths` for modules is regex-based, not YAML-parsed.** The answer ("which file contains this path") is a property of the source text, and the call happens per-path on every collection regeneration, so avoiding a full YAML parse is deliberate.
- **Temp output lives in `node_modules/.cache`.** The directory is created with `{ recursive: true }` on each run; nothing else in the repo writes there, so it is safe to delete.
- **Error surfacing is intentional.** When `redocly bundle` fails (almost always a dangling `$ref` after a module is deleted without removing its path from the root index), the raw stderr is forwarded verbatim so the offending line number is visible.
