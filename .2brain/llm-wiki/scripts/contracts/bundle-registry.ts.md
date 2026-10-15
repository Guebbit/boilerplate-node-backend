---
source: scripts/contracts/bundle-registry.ts
sha256: 56a2cca0ba1d1cb87671ae98e4afb2050602330e3ebb280472b13efa11f53b98
generated_at: 2026-10-15T09:36:35.294217+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/bundle-registry.ts

## Purpose

Central registry of every contract bundle this repo produces. It assembles a single `readonly` list (`CONTRACT_BUNDLES`) that the CLI, the staleness guard, and the cross-cutting test all iterate, so adding a new bundle is one entry plus its spec file. It also exposes a name-based lookup (`findBundle`) for CLI dispatch.

## Key elements

- **`collectionBundle(tool, file)`** – Factory that builds a `ContractBundle` entry for a client-collection tool. Its `content` callback uses a dynamic `import()` of `client-collections-bundle` so app code is never loaded at bundle-registration time.
- **`brunoBundle` / `insomniaBundle` / `mockoonBundle` / `postmanBundle`** – Concrete generated bundles produced via `collectionBundle`; each writes to the repo root as `contract.<tool>.<ext>`.
- **`CONTRACT_BUNDLES`** – The canonical `readonly ContractBundle[]` of all seven bundles (openapi, asyncapi, asyncapi.public, and the four collection tools). This is the single list every consumer iterates.
- **`findBundle(name)`** – Returns one bundle by its CLI handle string, or `undefined`.
- **`export * from './bundle-kinds'`** – Re-exports the `ContractBundle` type and any other exports from the kinds module so consumers only need to import from this file.

## Relationships

- **`bundle-kinds.ts`** – Source of the `ContractBundle` type used throughout; fully re-exported here.
- **`openapi-bundle.ts` / `asyncapi-bundles.ts`** – Provide the AUTHORED bundle objects (`openapiBundle`, `asyncapiBundle`, `asyncapiPublicBundle`) that are spliced into `CONTRACT_BUNDLES`.
- **`client-collections-bundle.ts`** – Dynamically imported inside `collectionBundle`'s `content` callback; never a static import (enforced by the dependency-cruiser rule `contracts-bundler-loads-no-generated-code`).
- **`modules-on-disk.ts`** – Supplies `REPO_ROOT` for resolving output file paths.
- **`build-bundles.ts`** – Consumes `CONTRACT_BUNDLES` / `findBundle` to drive the build CLI.
- **`tests/cross-cutting/contract-bundles.test.ts`** – Iterates `CONTRACT_BUNDLES` to assert invariants across all entries.

## Notes

- **Dynamic import is load-bearing.** Collections load app seed values; `api/` does not exist yet during `postinstall`. A static import would crash the bundler. The dependency-cruiser rule enforces the dynamic form.
- **AUTHORED vs GENERATED distinction.** Authored bundles (`asyncapi.yaml`, `asyncapi.public.yaml`) are committed and guarded against drift. Generated bundles (openapi, collections) are `.gitignore`d and rebuilt on every install, so they cannot go stale.
- **Insomnia extension quirk.** The file is `contract.insomnia.json` (matching the tool's export convention) but contains YAML; Insomnia's importer keys on content, not extension.
- **`asyncapi.yaml` is a superset.** It retains every channel because this repo's own types derive from it; the frontend receives the public half (`asyncapi.public.yaml`).
