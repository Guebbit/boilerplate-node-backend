---
source: scripts/contracts/client-collections-bundle.ts
generated_at: 2026-11-22T01:55:09.522953+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/client-collections-bundle.ts

## Purpose
Generates the Bruno API client collection from the repo's OpenAPI contract. The output is a `contract.generated.bruno.yml` file at the repo root. It is generated on demand (`npm run contracts:bundle -- bruno`) and git-ignored, so ~1.9 MB of derived text stays out of contract diffs. The traversal, example synthesis and emitters live in `@guebbit/openapi-runnable-collections`. This file only supplies the repo-specific configuration: path ownership, example values, and probes.

## Key elements
- `COLLECTION_TOOLS` (`['bruno']`): the tools a collection is generated for. The library also knows Insomnia, Mockoon and Postman.
- `COLLECTION_NAME` (`'Boilerplate API'`): the name the collection carries.
- `sections()`: builds one folder per module from `SECTION_ORDER` and `sectionPaths(name)`, dropping modules that own no paths (e.g. the components-only `access`).
- `baseValues` (`ValueSources`): the foundation's value table, with all credentials and ids taken from `SUBJECTS`.
  - `byProperty` fills request bodies by property name (email, password, userId, page, pageSize and others).
  - `byOperation` overrides `POST /account/login` with the admin's credentials and `POST /account/signup` with a new shopper plus user credentials.
  - `byFormat` supplies email and password values by format.
  - `pathParam` resolves `locale`, and resolves `id` to the user id for `/users…` paths and the admin id otherwise.
  - `tokens` exposes seed facts as `{{seedAdmin…}}` and `{{seedUser…}}` for probes.
- `readCollectionValues(loaded)`: narrows a loaded values file to its `collectionValues` export, and throws if the export is missing.
- `loadModuleValues()`: memoised. Scans `scenarios/values/*.ts` in sorted order and dynamically imports each file.
- `loadValues()`: merges every module's `byProperty`, `tokens` and `pathParam` into `baseValues`. Base entries win for `byProperty` and `tokens`. Module `pathParam`s are asked first, then the base one.
- `modulesDeclaringProbes(modulesRoot?)` (exported): lists module folders that have a `probes.ts`, via `modulesWith`.
- `hasProbes`: type guard for a loaded `probes.ts` module.
- `loadProbes()`: memoised. Dynamically imports each module's `probes` and returns a `{ moduleName: Probe[] }` map. It throws if a module exports no `probes` array.
- `generate()`: runs `generateCollections` using the probes, the merged values and `loadSpec(...)` on the repo root's generated spec. It is not memoised.

## Relationships
- `scripts/contracts/openapi-bundle.ts`: provides `SECTION_ORDER` and `sectionPaths`, which drive the folder layout.
- `scenarios/subjects.ts`: provides `SUBJECTS`, the seeded admin and user credentials and ids used in `baseValues`.
- `scenarios/collection-values.ts`: provides the `CollectionValues` type that each `scenarios/values/<module>.ts` file must satisfy.
- `scripts/modules-on-disk.ts`: provides `REPO_ROOT`, `MODULES_ROOT` and `modulesWith`, used for the directory scans.
- `scripts/contracts/bundle-registry.ts`: a new tool added to `COLLECTION_TOOLS` also needs a bundle entry here.
- `tests/cross-cutting/contract-bundles.test.ts` and `tests/unit/scripts/modules/new-module-needs-nothing.test.ts`: test-side consumers of this bundle and its discovery behaviour. The visible content doesn't show how they use it.

## Notes
- Values are limited to ids and credentials. This file cannot import module fixtures such as `scenarios/products.ts`, because those pull in `@modules/*` code that imports the generated `@api/` client. That would create the same cycle `openapi-bundle.ts` avoids. Titles, prices and descriptions therefore fall back to type- and format-shaped defaults.
- The admin credentials on the login operation are deliberate. A narrower token would make admin-only requests fail with 403.
- Probes and module values are discovered by directory scan, so adding or removing a module needs no edit here. Both loaders are memoised, since they are source. `generate()` is not, because the build writes `openapi.yaml` in phase 1 and generates from it in phase 2.
- Probes are authored requests that show the API rejecting things, which a spec cannot describe.
