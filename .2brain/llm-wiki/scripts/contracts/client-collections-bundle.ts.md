---
source: scripts/contracts/client-collections-bundle.ts
sha256: 702df9c3f59705174732aa1bf494be682d82138bcb1cd78e164913b51ba6b761
generated_at: 2026-10-15T09:37:03.886808+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/client-collections-bundle.ts

## Purpose

Configuration file that drives on-demand generation of four API client collections (Bruno, Insomnia, Mockoon, Postman) from the root `openapi.yaml`. It supplies the three repo-specific inputs the `@guebbit/openapi-runnable-collections` generator cannot derive on its own: which module owns which paths, which seeded values fill request bodies, and which authored probes demonstrate rejection. The generated files are `.gitignore`d; this file is the only committed artifact.

## Key elements

- **`sections()`** — Maps `SECTION_ORDER` (from `openapi-bundle.ts`) to `{name, paths}` entries via `sectionPaths()`, dropping modules that own no paths (e.g. `access`).
- **`values`** (a `ValueSources` object) — The complete value table: `byProperty` (ids, credentials, defaults), `byOperation` (admin login/signup bodies), `byFormat`, `pathParam` (resolves `id` by URL prefix), and `tokens` (seed facts as `{{token}}` strings for probes).
- **`modulesDeclaringProbes(modulesRoot?)`** *(exported)* — Discovers which module directories contain a `probes.ts` via `modulesWith()`.
- **`loadProbes()`** — Memoized; dynamically imports every discovered `probes.ts` and validates it exports a `probes` array.
- **`generate()`** — Single call to `generateCollections()`; deliberately **not** memoized because `build-bundles.ts` writes `openapi.yaml` before calling this.
- **`allProbes()`** *(exported)* — Returns the flattened list of probe-derived `CollectionRequest` objects (used by coverage checks).
- **`collectionContent(tool)`** *(exported)* — Returns the rendered document text for a given tool; throws if the generator produced nothing for that tool.
- **`ORDER_ID_VARIABLE`** — `{{orderId}}`; a collection variable slot because real order IDs are minted at runtime and cannot be hardcoded.
- **`COLLECTION_TOOLS`** — `['bruno', 'insomnia', 'mockoon', 'postman']` (order is display order).
- **`COLLECTION_NAME`** — `"Boilerplate API"`, the name shown in Bruno/Insomnia/Postman.

## Relationships

- **`scripts/contracts/openapi-bundle.ts`** — Imports `SECTION_ORDER` and `sectionPaths` to build the `sections()` list; the same circular-import concern (module code → `@api/` client) that motivated splitting them into separate files also shapes this file's value sources.
- **`scenarios/subjects.ts`** — Imports `SUBJECTS` and `SEED_PRODUCT_IDS`; all "real" values in `values` (ids, emails, passwords, soft-deleted product ids) come from here, never hardcoded.
- **`scripts/modules-on-disk.ts`** — Imports `REPO_ROOT`, `MODULES_ROOT`, and `modulesWith` for the filesystem scan that discovers probe modules.
- **`scripts/contracts/bundle-registry.ts`** — Reaches `collectionContent` via dynamic `import()`, so loading the registry never pulls in the seed values statically.
- **`tests/cross-cutting/contract-bundles.test.ts`** — Integration tests exercising the full generation pipeline.
- **`tests/unit/scripts/modules/new-module-needs-nothing.test.ts`** — Verifies that a new module with no `probes.ts` and no special values does not break the collection build.

## Notes

- **Not memoized by design.** `generate()` is called fresh each time because `build-bundles.ts` writes `openapi.yaml` in phase 1 and generates in phase 2; a cached result would be stale.
- **Probes are memoized.** The probe sources are static TypeScript files on disk and cannot change mid-run, unlike the contract.
- **Dynamic `import()` of probes.** The target path is computed at runtime after the directory scan; both `tsx` and `ts-jest` resolve bare `.ts` paths for this.
- **Order IDs are never literals.** `ORDER_ID_VARIABLE` (`{{orderId}}`) and `seedDeletedOrderId` (`{{deletedOrderId}}`) are collection-variable placeholders because real order IDs are minted by `scenarios/flows/` and differ every run.
- **Postman is a separate emitter**, not a rename of Insomnia: Collection Format v2.1 splits URLs into parts and reads those rather than the full string, and the compatibility path is one-way.
- **Generated files are ~1.9 MB of derived text** and are excluded from git to keep contract diffs clean.
