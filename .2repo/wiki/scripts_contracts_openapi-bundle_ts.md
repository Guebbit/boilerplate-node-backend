# scripts/contracts/openapi-bundle.ts

## Purpose

Compiles the repo's REST contract (`openapi.yaml`) by running `redocly bundle` against a root document that `$ref`s one standalone OpenAPI file per module. Exports a `CompiledBundle` descriptor so the bundle registry can track staleness, write the output, and let downstream consumers (client collections, tests) read the current contract.

## Key elements

- **`MODULE_SECTIONS`** — Hand-curated, ordered list of the 12 modules that contribute a standalone `openapi.yaml`. Order is narrative (the walk a caller takes through the shop).
- **`SECTION_ORDER` / `SectionName`** — `MODULE_SECTIONS` prefixed with `'system'`; the full set of path-ownership sections.
- **`moduleSpec(section)`** — Resolves the absolute path to `src/modules/<section>/openapi.yaml`.
- **`assertModuleSectionsAreCurrent()`** — Runs at import time; throws if `MODULE_SECTIONS` membership drifts from `enabledModules` filtered to folders that actually contain an `openapi.yaml`.
- **`rootPaths()`** — Parses `openapi.root.yaml`, returns only non-`$ref` path keys (the system/shell paths).
- **`sectionPaths(section)`** — Returns every path key a section declares. Uses a text regex (`PATH_LINE`) for modules, the parsed root for `system`.
- **`compile()`** — Memoised. Invokes the Redocly CLI to bundle `ROOT_SPEC` into a temp file, prepends a two-line "DO NOT EDIT" marker, and returns the string.
- **`openapiBundle`** — The `CompiledBundle` export: name, label, output path, `compiled: true`, the `compile` getter, and a `sources()` list.

## Relationships

- **`scripts/contracts/bundle-kinds.ts`** — Provides the `REPO_ROOT` constant and the `CompiledBundle` type that `openapiBundle` implements.
- **`scripts/contracts/bundle-registry.ts`** — Consumes the `openapiBundle` export to register it alongside other bundles (client collections, etc.) for unified staleness checks and output.
- **`scripts/contracts/client-collections-bundle.ts`** — Imports `SECTION_ORDER` and `sectionPaths` to group generated requests into per-section folders (including "System").
- **`src/modules.ts`** — Supplies `enabledModules`, the live module registry used by the sync assertion.
- **`tests/cross-cutting/contract-bundles.test.ts`** — Exercises the bundle's compile and source-listing behaviour.

## Notes

- `MODULE_SECTIONS` **order** is deliberately hand-curated; only **membership** is machine-checked. Reordering requires a human edit.
- The `system` section has no folder on disk. Its paths are the non-`$ref` entries in `openapi.root.yaml` (e.g. `GET /`).
- The "DO NOT EDIT" marker is prepended to the *output*, never written into a source file, because Redocly parses and discards comments.
- `compile()` is memoised per process; the assumption is that source files cannot mutate between calls within a single script run.
- `PATH_LINE` is a regex over raw text, not a property of the parsed YAML. This is intentional: it answers "which file owns this path?" without loading the full document, and is called for every path on every collection regeneration.
- Deleting a module requires removing both its folder **and** its `$ref` block in the root's `paths` index; forgetting the second half surfaces as a Redocly error naming the exact line.
