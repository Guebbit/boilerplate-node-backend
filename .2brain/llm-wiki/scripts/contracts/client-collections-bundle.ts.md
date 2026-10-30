---
source: scripts/contracts/client-collections-bundle.ts
sha256: 2198e268ecf53956b4670b10ec9dfbca4f22afcf31c8f7c8580c9f158fc3c219
generated_at: 2026-10-29T01:30:21.802721+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/client-collections-bundle.ts

## Purpose

Configuration layer that feeds the `@guebbit/openapi-runnable-collections` generator to produce four API-client collections (Bruno, Insomnia, Mockoon, Postman) on demand via `npm run contracts:bundle`. All four outputs are gitignored; this file exists so that a new module or a value change requires no edit here — module ownership, seed values, and rejection probes are all discovered from the filesystem at run time.

## Key elements

- **`COLLECTION_TOOLS`** — the four target emitters, in canonical order: bruno, insomnia, mockoon, postman.
- **`sections()`** — maps `SECTION_ORDER` (from `openapi-bundle.ts`) to per-module path lists via `sectionPaths`; drops modules that own no paths (e.g. `access`).
- **`baseValues: ValueSources`** — the foundation's seed data: `byProperty` (credentials, locale, pagination defaults), `byOperation` (admin login and signup bodies), `byFormat`, `pathParam` (id resolution by URL prefix), and `tokens` (named seed facts for probes).
- **`readCollectionValues(loaded)`** — narrows an imported module namespace to its `collectionValues` export; throws if absent.
- **`loadModuleValues()`** — memoised directory scan of `scenarios/values/*.ts`; dynamically imports each file and extracts its values.
- **`loadValues()`** — merges `baseValues` with every module's values; module `pathParam` handlers are consulted first, foundation is the fallback.
- **`modulesDeclaringProbes(modulesRoot?)`** *(exported)* — returns the names of modules that contain a `probes.ts`, using `modulesWith` from `modules-on-disk.ts`.
- **`loadProbes()`** — memoised; dynamically imports every discovered `probes.ts`, validates the `probes` array export, and returns `Record<string, Probe[]>`.
- **`generate()`** — orchestrates a single `generateCollections` call with the loaded spec (`openapi.yaml`), sections, probes, values, and target list. Intentionally **not** memoised.

## Relationships

- **`scripts/contracts/openapi-bundle.ts`** — supplies `SECTION_ORDER` and `sectionPaths`, the single source of truth for module→path ownership.
- **`scenarios/subjects.ts`** — supplies `SUBJECTS` (seed admin/user emails, passwords, ids) that populate `baseValues` and the token table.
- **`scenarios/collection-values.ts`** — provides the `CollectionValues` type that every `scenarios/values/<module>.ts` file must export; this file casts to it via `readCollectionValues`.
- **`scripts/modules-on-disk.ts`** — provides `REPO_ROOT`, `MODULES_ROOT`, and `modulesWith` for filesystem discovery.
- **`tests/cross-cutting/contract-bundles.test.ts`** — exercises the full generation path end-to-end.
- **`tests/unit/scripts/modules/new-module-needs-nothing.test.ts`** — verifies that adding a new module folder (with its values/probes files) is picked up automatically without editing this file.

## Notes

- **No memoisation on `generate()`.** The build script (`build-bundles.ts`) writes `openapi.yaml` in phase 1 and calls generation in phase 2; a cached result would reflect a contract that didn't yet exist.
- **Discovery is directory-scan, not a registry.** A module that adds `scenarios/values/foo.ts` or `probes.ts` appears in the next run with zero changes to this file. Deleting a module removes it equally.
- **Import-cycle constraint.** This file may only reference `SUBJECTS` and shape-level seed data. It cannot import a module's own fixtures (e.g. `scenarios/products.ts`) because those transitively import the generated `@api/` client — the same cycle that forced `openapi-bundle.ts` to stop importing `enabledModules`.
- **Postman is a distinct emitter**, not a rename of Insomnia: Collection Format v2.1 splits URLs into parts and reads those rather than the combined string.
- **Dynamic `import()` of `.ts` paths** is used for both values and probes; works under both `tsx` and `ts-jest`.
