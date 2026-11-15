---
source: scripts/contracts/client-collections-bundle.ts
sha256: 659cf09e90ce978877551ec2b2bbf678e8bf7843e943cbdd9fdff5effaa48093
generated_at: 2026-11-14T17:23:44.875723+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/client-collections-bundle.ts

## Purpose

Configuration (not machinery) for generating an API client collection from the OpenAPI contract. The traversal, example synthesis, and emitters live in `@guebbit/openapi-runnable-collections`; this file supplies the three things only this repo can answer: which module owns which path, where realistic example values (credentials, IDs) come from, and which rejection probes each module declares. Output is generated on demand (`npm run contracts:bundle -- bruno`) and gitignored.

## Key elements

- **`COLLECTION_TOOLS`** — `readonly ['bruno']`; the set of tools to emit. Extending it (plus a `bundle-registry.ts` entry and a `.gitignore` line) adds another tool.
- **`sections()`** — Maps `SECTION_ORDER` × `sectionPaths` into the ordered folder structure of the collection, dropping modules with zero paths.
- **`baseValues: ValueSources`** — Foundation credential/ID table: `byProperty`, `byOperation` (admin login, signup), `byFormat`, `pathParam`, and `tokens`. Only seeded credentials and IDs are real; everything else falls through to type-shaped defaults.
- **`readCollectionValues(loaded)`** — Runtime check that a `scenarios/values/<module>.ts` file exports `collectionValues`.
- **`loadModuleValues()`** — Memoised directory scan of `scenarios/values/` with dynamic `import()`; returns all module `CollectionValues`.
- **`loadValues()`** — Merges `baseValues` with every module's values (module `pathParam` is consulted first; module `byProperty`/`tokens` override foundation entries).
- **`modulesDeclaringProbes(modulesRoot?)`** *(exported)* — Returns module folder names containing a `probes.ts`, discovered via `modulesWith()`.
- **`loadProbes()`** — Memoised dynamic import of every module's `probes.ts`; returns `Record<moduleName, Probe[]>`.
- **`generate()`** — Single call into `generateCollections()`. Deliberately **not** memoised: the contract it reads is written in a prior build phase.

## Relationships

- **`scripts/contracts/openapi-bundle.ts`** — Imports `SECTION_ORDER` and `sectionPaths` to derive collection folder structure from the same module ordering used for the OpenAPI spec.
- **`scripts/modules-on-disk.ts`** — Imports `REPO_ROOT`, `MODULES_ROOT`, and `modulesWith()` for filesystem discovery of probes and module layout.
- **`scenarios/subjects.ts`** — Imports `SUBJECTS` to populate every credential and ID in `baseValues` and `tokens`.
- **`scenarios/collection-values.ts`** — Supplies the `CollectionValues` type that each module's `scenarios/values/<module>.ts` must conform to.
- **`scripts/contracts/bundle-registry.ts`** — Must register a bundle entry per tool in `COLLECTION_TOOLS` so the build pipeline knows where to write output.
- **`tests/cross-cutting/contract-bundles.test.ts`** — Integration test exercising the full bundle generation path.
- **`tests/unit/scripts/modules/new-module-needs-nothing.test.ts`** — Verifies that a freshly added module (with no values file or probes) does not break this configuration.

## Notes

- **Not memoised in `generate()`:** `scripts/contracts/build-bundles.ts` writes `openapi.yaml` in phase 1 and calls `generate()` in phase 2. A cached result would predate the contract it claims to derive from.
- **Dynamic `import()` for probes and module values:** The set of modules is only known after a filesystem scan; tsx and ts-jest both resolve bare `.ts` paths, so a static import list is impossible.
- **Credential discipline:** Only seeded credentials and IDs appear in generated requests. Invented IDs or passwords would produce a login that fails, which is the first thing anyone does with a collection.
- **Adding a new tool:** Update `COLLECTION_TOOLS`, add a bundle in `bundle-registry.ts`, add a `.gitignore` line. The same probes and values feed the new emitter automatically.
