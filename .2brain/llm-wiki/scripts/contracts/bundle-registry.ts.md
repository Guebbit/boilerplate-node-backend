---
source: scripts/contracts/bundle-registry.ts
sha256: f5eaacbd50835aa33c170b8aade18e15febf29f51d189d2ed8c9a8854736bac0
generated_at: 2026-11-08T02:39:56.053215+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/bundle-registry.ts

## Purpose

Single canonical list of every contract document this repo produces (7 bundles: 3 authored, 4 generated). The CLI, the staleness check, and the cross-cutting test all iterate this one array, so adding a new bundle is one entry here plus its spec file.

## Key elements

- **`collectionBundle(tool, file)`** – Factory that builds a generated-bundle entry. Content is a lazy `() => import('./client-collections-bundle').then(...)` thunk so app code is never loaded at `postinstall` time.
- **`brunoBundle` / `insomniaBundle` / `mockoonBundle` / `postmanBundle`** – The four collection entries produced by calling `collectionBundle` with the tool name and target file name (e.g. `contract.bruno.yml`).
- **`CONTRACT_BUNDLES`** – Exported `readonly ContractBundle[]` containing all 7 bundles (`as const`).
- **`findBundle(name)`** – Lookup by CLI handle (the `name` field); returns the bundle or `undefined`.
- **`export * from './bundle-kinds'`** – Re-exports the `ContractBundle` type and any other constants from `bundle-kinds.ts` so consumers can import them from either file.

## Relationships

- **`bundle-kinds.ts`** – Provides the `ContractBundle` type used to type every entry and the array itself.
- **`openapi-bundle.ts`** – Supplies `openapiBundle` (the authored OpenAPI bundle).
- **`asyncapi-bundles.ts`** – Supplies `asyncapiBundle` (full) and `asyncapiPublicBundle` (public subset).
- **`client-collections-bundle.ts`** – Dynamically imported at build time inside each collection bundle's `content` thunk; never loaded at module-evaluation time.
- **`modules-on-disk.ts`** – Provides `REPO_ROOT` for resolving output paths.
- **`build-bundles.ts`** – Downstream consumer that reads `CONTRACT_BUNDLES` to drive the build/CLI.
- **`tests/cross-cutting/contract-bundles.test.ts`** – Iterates `CONTRACT_BUNDLES` to assert invariants across all entries.

## Notes

- All generated (collection) bundles are `.gitignore`d and rebuilt on every install; an uncommitted file cannot be stale.
- `asyncapi.yaml` publishes **every** channel (the repo's own types derive from it); `asyncapi.public.yaml` carries only the public half for the frontend.
- The Insomnia entry is named `.json` per Insomnia's export convention but contains YAML — the importer keys on content, not extension.
- A dependency-cruiser rule (`contracts-bundler-loads-no-generated-code`) enforces that the `content` import stays dynamic.
