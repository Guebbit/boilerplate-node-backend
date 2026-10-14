---
source: scripts/contracts/bundle-registry.ts
sha256: 41bac3e584b17dd0ad8319cf6014a48fc4e011b74750407053640987e469732e
generated_at: 2026-10-14T07:10:16.745898+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/bundle-registry.ts

## Purpose

Central registry of every contract document this repo produces (authored and generated). It is the single list that the CLI, the staleness check, and the cross-cutting test all iterate over, so adding a new bundle requires only one entry here plus its spec file.

## Key elements

- **`CONTRACT_BUNDLES`** (`readonly ContractBundle[]`) — the full list of seven bundles: `openapiBundle`, `asyncapiBundle`, `asyncapiPublicBundle`, and four collection bundles (Bruno, Insomnia, Mockoon, Postman).
- **`findBundle(name)`** — looks up a single bundle by its CLI handle string.
- **`collectionBundle(tool, file)`** (internal) — factory that produces a generated `ContractBundle` entry for a collection tool. Resolves its `content` via a dynamic `import()` of `client-collections-bundle` so app code is never loaded at definition time.
- **`brunoBundle`, `insomniaBundle`, `mockoonBundle`, `postmanBundle`** (internal) — the four concrete collection bundles, each writing `contract.<tool>.<ext>` to the repo root.
- **`export * from './bundle-kinds'`** — re-exports the `ContractBundle` type and `REPO_ROOT` so consumers can import them from this module.

## Relationships

- **`bundle-kinds.ts`** — provides the `ContractBundle` type and `REPO_ROOT` used throughout; re-exported here for convenience.
- **`asyncapi-bundles.ts`** — supplies `asyncapiBundle` and `asyncapiPublicBundle` (the two authored asyncapi entries).
- **`openapi-bundle.ts`** — supplies `openapiBundle`.
- **`client-collections-bundle.ts`** — lazily imported inside `collectionBundle` to obtain `collectionContent(tool)`; never loaded at module-evaluation time.
- **`build-bundles.ts`** — the CLI entry point that iterates `CONTRACT_BUNDLES` and calls `findBundle` to locate a bundle by name.
- **`tests/cross-cutting/contract-bundles.test.ts`** — iterates `CONTRACT_BUNDLES` to validate every bundle.

## Notes

- The dynamic `import()` in `collectionBundle` is intentional and enforced by the dependency-cruiser rule `contracts-bundler-loads-no-generated-code`; collection content depends on `api/` which does not exist yet during `postinstall`.
- `openapi.yaml` and all `contract.*.{yml,json}` outputs are `.gitignore`d and rebuilt on every install. Only `asyncapi.yaml` and `asyncapi.public.yaml` are committed (authored).
- `asyncapi.public.yaml` is a **subset** of `asyncapi.yaml` — it publishes only the public half of the channels.
- The Insomnia file is named `.json` but contains YAML; Insomnia's importer keys on content, not extension.
