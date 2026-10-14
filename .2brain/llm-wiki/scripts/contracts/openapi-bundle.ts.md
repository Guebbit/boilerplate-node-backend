---
source: scripts/contracts/openapi-bundle.ts
sha256: 098471c13f1971b45428eb863c5a4aa06451dbfdb285266db0a5e92098b407ac
generated_at: 2026-10-14T07:11:27.373365+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/openapi-bundle.ts

## Purpose

Compiles the repository's published REST contract (`openapi.yaml`) from one standalone OpenAPI document per module under `src/modules/<name>/`. Instead of concatenating, it invokes `redocly bundle` and then runs a series of post-processing passes (app-level responses, versioned-resource headers, module stamps, error-code catalogue) on the bundled YAML. Also provides the section-order and path-discovery utilities that other contract scripts (client collections, personal-data export, pruning) rely on to locate which module owns which path.

## Key elements

- **`MODULE_ORDER`** – Static preference list (locales → observability → … → api-keys) defining the narrative order sections appear in the contract.
- **`MODULE_SECTIONS`** – Runtime-discovered list of module folders that contain an `openapi.yaml`, ordered via `orderSections(MODULE_ORDER, modulesWithOpenapi())`.
- **`SECTION_ORDER`** – `['system', …MODULE_SECTIONS]`; the full set of groupings for paths.
- **`moduleSpec(section)`** – Returns the filesystem path to a module's standalone `openapi.yaml`.
- **`sectionPaths(section)`** – Returns every path a section declares, in declaration order. For `system`, parses the root YAML and filters out `$ref` entries; for modules, regex-extracts path keys (`PATH_LINE`).
- **`withAppLevelResponses(bundled: string): string`** – Merges the root's `x-app-level-responses` (e.g. 429, 400/413/415 for body-carrying ops) into every operation that lacks its own declaration. Deletes the `x-app-level-responses` key afterward. Returns re-stringified YAML with `lineWidth: 0`.
- **`withVersionedResources`** – Adds `ETag` (GET), `If-Match` + 412 (PUT/PATCH/DELETE) to paths marked `x-versioned`. (Implementation truncated in source view.)
- **`withModuleStamps`** – Tags every operation with an `x-module` tag derived from the fragment that owns it. (Referenced in header doc; implementation not visible.)
- **`withErrorCodes`** – Collects each fragment's `x-error-codes` into a single catalogue on the bundle. (Referenced in header doc; implementation not visible.)
- **`withEtagHeader`** – Internal helper; adds an `ETag` header to an inline `200` response. Refuses `$ref`-shaped 200s loudly.
- **`operationsOf` / `appliesToOperation` / `withDefaults`** – Internal helpers for the app-level-response merge pass.
- **`isBundledDocument` / `isOperation`** – Type guards that fail early with descriptive messages on malformed input.

## Relationships

| Neighbor | Interaction |
|---|---|
| `shared/contracts/openapi.root.yaml` | Read by `rootPaths()` and passed as the root document to `redocly bundle`; supplies `x-app-level-responses` and shared components. |
| `scripts/contracts/bundle-kinds.ts` | Imports `REPO_ROOT` and the `CompiledBundle` type used throughout path resolution. |
| `scripts/contracts/section-order.ts` | Imports `orderSections` to produce `MODULE_SECTIONS` from the preference list + disk discovery. |
| `scripts/contracts/root-assembly.ts` | Imports `assembleRoot` (completes the root's path index before bundling) and `readModuleFragments`. |
| `scripts/contracts/analytics-browser-events.ts` | Imports `withBrowserEvents` for a post-bundle pass. |
| `scripts/contracts/personal-data-assembly.ts` | Imports `stageExportSchema` for the personal-data export step. |
| `scripts/contracts/prune-unused.ts` | Imports `pruneUnused` to strip unreferenced components after assembly. |
| `src/infrastructure/adapters/logger.ts` | Graph neighbor; likely used for build-step logging (not visible in truncated portion). |
| `tests/unit/scripts/contracts/openapi-bundle.test.ts` | Unit tests for the functions in this file. |
| `tests/cross-cutting/contract-bundles.test.ts` | Cross-cutting integration test over the assembled bundles. |
| `tests/unit/scripts/mutation/ci/waves.test.ts` | Verifies CI mutation waves exercise the bundling pipeline. |

## Notes

- **`lineWidth: 0`** on every `stringifyYaml` call is deliberate: it disables line-folding so that unrelated text shifts never rewrap `description:` fields, keeping regeneration diffs minimal.
- **`x-app-level-responses` is deleted** after the merge pass. It is an assembly instruction, not a consumer-facing key; leaving it in the published contract would be noise.
- **`PATH_LINE` is a regex, not a parse.** It is intentionally textual because `sectionPaths` is called on every client-collections regeneration, and the answer ("which file contains this URL?") is a property of the source file, not the parsed document.
- **`rootPaths()` parses YAML** (unlike `PATH_LINE`) because the root's `paths:` map mixes real system operations with `$ref` pass-throughs; only the non-`$ref` entries belong to the `system` section.
- **`withAppLevelResponses` never overwrites.** An operation that already declares its own `429` (e.g. a named per-route budget) keeps it; the merge fills gaps only.
- **Adding or removing a module** requires no change to this file: `MODULE_SECTIONS` is discovered from disk at build time. The only artifact is the module's own `openapi.yaml`.
