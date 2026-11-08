---
source: scripts/contracts/client-collections-bundle.ts
sha256: 2198e268ecf53956b4670b10ec9dfbca4f22afcf31c8f7c8580c9f158fc3c219
generated_at: 2026-11-08T02:40:25.218840+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/client-collections-bundle.ts

## Purpose

Repo-specific configuration that feeds the `@guebbit/openapi-runnable-collections` generator to produce the four client collections (`contract.{bruno,insomnia,mockoon,postman}.*`). It answers the three questions only this codebase can: which module owns which path, which seeded values fill request bodies and path params, and which authored probes demonstrate rejections. The actual traversal, example synthesis, and tool emitters live in the external package.

## Key elements

- **`COLLECTION_TOOLS` / `COLLECTION_NAME`** — the four target tools in order and the shared display name ("Boilerplate API").
- **`sections()`** — maps `SECTION_ORDER` (from `openapi-bundle`) to per-module paths; drops modules with zero paths (e.g. `access`).
- **`baseValues`** (`ValueSources`) — foundation-level example data: `byProperty` (ids, credentials, pagination), `byOperation` (admin login, user signup), `byFormat`, `pathParam`, and `tokens` (seed credentials as `{{…}}` placeholders for probes).
- **`readCollectionValues` / `loadModuleValues`** — discovers and memoised-imports every `scenarios/values/*.ts`, extracting its `collectionValues` export.
- **`loadValues`** — merges `baseValues` with all module values; module `pathParam` is consulted first, falling back to the foundation's.
- **`modulesDeclaringProbes`** *(exported)* — directory scan for modules that contain a `probes.ts`.
- **`loadProbes`** — memoised dynamic import of every discovered `probes.ts`, validated via the `hasProbes` type guard.
- **`generate`** — single call to `generateCollections` with spec, sections, probes, values, and targets. Deliberately **not** memoised (see Notes).

## Relationships

- **`scripts/contracts/openapi-bundle.ts`** — imports `SECTION_ORDER` and `sectionPaths` to build the `sections()` list.
- **`scenarios/subjects.ts`** — imports `SUBJECTS`; all seeded credentials and ids in `baseValues` come from here.
- **`scenarios/collection-values.ts`** — provides the `CollectionValues` type used by `readCollectionValues`.
- **`scripts/modules-on-disk.ts`** — imports `REPO_ROOT`, `MODULES_ROOT`, and `modulesWith` for filesystem discovery.
- **`tests/cross-cutting/contract-bundles.test.ts`** — integration tests exercising the generated collections.
- **`tests/unit/scripts/modules/new-module-needs-nothing.test.ts`** — verifies a new module adds nothing to the collections without its own `values/` or `probes.ts`.

## Notes

- **Generated output is not committed.** All four collection files are in `.gitignore`; they are produced on demand via `npm run contracts:bundle`.
- **Circular-import guard.** This file must never import a module's own fixtures (`scenarios/products.ts`, etc.) because those pull in `@modules/*` code, which imports the generated `@api/` client — the same cycle that forced `openapi-bundle.ts` to drop its `enabledModules` import.
- **Values are deliberately minimal.** Only ids and credentials are real; titles, prices, and descriptions fall through to type/format-shaped defaults. A full realistic shop requires `npm run demo`.
- **`generate()` is intentionally un-memoised.** The build script writes `openapi.yaml` in phase 1 and reads it in phase 2; a cached result would predate the spec it claims to derive from. (`loadProbes` and `loadModuleValues` *are* memoised because they read source that cannot change mid-run.)
- **Postman is a distinct emitter**, not a renamed Insoman: Collection Format v2.1 splits URLs into parts and reads those rather than the string, and the compatibility mapping is one-directional.
