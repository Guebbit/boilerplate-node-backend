---
source: scripts/contracts/openapi-bundle.ts
sha256: 30bca4294428ff4aa521c6c5285dd60075e9f3bf9e04ebe2ff652804973baaad
generated_at: 2026-10-29T01:31:34.913401+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/openapi-bundle.ts

## Purpose

Compiles the project's REST contract (`openapi.yaml`) by bundling standalone per-module OpenAPI documents via `redocly bundle`, then runs a pipeline of post-processing passes (cookie auth, app-level responses, 304 handling, versioned resources, module stamps, error-code catalogue) on the resolved bundle. Replaces the old concatenation approach so that each module owns a complete, valid document and shared pieces live in the root spec reached by `$ref`.

## Key elements

- **`MODULE_ORDER`** — fixed narrative sequence (locales → … → api-keys) used to order sections; discovery itself is from disk.
- **`MODULE_SECTIONS`** — `orderSections(MODULE_ORDER, modulesWith(MODULES_ROOT, 'openapi.yaml'))`; the actual list of contributing modules in assembly order.
- **`SECTION_ORDER`** — prepends `'system'` (the root's own `GET /`) to `MODULE_SECTIONS`.
- **`SectionName`** — a branded `string` alias for readability.
- **`moduleSpec(section)`** — resolves `src/modules/<section>/openapi.yaml`.
- **`ROOT_SPEC`** / **`OPENAPI_OUTPUT`** — paths to `shared/contracts/openapi.root.yaml` and the committed `openapi.yaml`.
- **`sectionPaths(section)`** — returns every path a section declares; `system` is parsed from the root doc (non-`$ref` entries), modules are extracted via the `PATH_LINE` regex.
- **`withAppLevelResponses(bundled)`** (exported) — merges the root's `x-app-level-responses` (429/500/503 for all, 400/413/415 for body-carrying, 415 for body-less writes) into every operation that doesn't already declare its own; deletes the `x-app-level-responses` key from the output.
- **`operationsOf` / `appliesToOperation` / `withDefaults`** — internal helpers that flatten operations, decide applicability, and merge without overwriting.
- **Imports for downstream passes** — `withCookieAuth`, `withBrowserEvents`, `stageExportSchema`, `pruneUnused`, `assembleRoot`, `readOpenApiFragment`, `readModuleFragments` are all consumed in the (truncated) pipeline section below `withAppLevelResponses`.

## Relationships

- **`scripts/contracts/root-assembly.ts`** — `assembleRoot` completes the root's path index and tag list from fragments *before* `redocly bundle` runs; `readModuleFragments` is used to gather fragments.
- **`scripts/contracts/section-order.ts`** — `orderSections` produces `MODULE_SECTIONS` from the preference list + disk discovery.
- **`scripts/modules-on-disk.ts`** — `modulesWith` discovers which module folders contain an `openapi.yaml`; `REPO_ROOT` / `MODULES_ROOT` anchor all path resolution.
- **`scripts/contracts/bundle-kinds.ts`** — supplies the `CompiledBundle` type used in the pipeline.
- **`scripts/contracts/fragments.ts`** — `readOpenApiFragment` reads a single module's standalone document.
- **`scripts/contracts/cookie-auth.ts`** — `withCookieAuth` adds the `cookieAuth` scheme and 403 to bearer operations.
- **`scripts/contracts/analytics-browser-events.ts`** — `withBrowserEvents` is a post-bundle pass.
- **`scripts/contracts/personal-data-assembly.ts`** — `stageExportSchema` handles the export schema.
- **`scripts/contracts/prune-unused.ts`** — `pruneUnused` removes orphaned components after all merges.
- **`shared/contracts/openapi.root.yaml`** — the root spec: shared components, system paths, and the `x-app-level-responses` map that `withAppLevelResponses` consumes.
- **`tests/unit/scripts/contracts/openapi-bundle.test.ts`** — unit tests for this file's exports.
- **`tests/cross-cutting/contract-bundles.test.ts`** — integration-level tests spanning multiple bundle scripts.

## Notes

- **`PATH_LINE` is intentionally a regex, not a YAML parse.** The file's own comment explains: it is called for every path on every client-collection regeneration, and ownership is a property of *which file* contains the line, not of the parsed document.
- **`withAppLevelResponses` never overwrites.** If an operation already declares a status (e.g. a route-specific 429 with its own `Retry-After`), the global default is skipped.
- **`x-app-level-responses` is deleted from the published output.** It is an assembly instruction, not a consumer-facing key.
- **`lineWidth: 0`** in the YAML stringify call disables line-folding so that unrelated text shifts don't rewrap descriptions and produce noisy diffs.
- **`system` is not a module folder.** It is a pseudo-section backed by non-`$ref` entries in `openapi.root.yaml`; it has no `src/modules/system/` directory.
- **Adding/removing a module** requires only adding/removing the module's own `openapi.yaml` file; `MODULE_SECTIONS` is re-derived from disk each run.
