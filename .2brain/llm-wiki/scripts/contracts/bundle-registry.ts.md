---
source: scripts/contracts/bundle-registry.ts
sha256: b1527337363b637a08ab1c8a5b2a85f4030c3f37aed2598ff2ca28ff8860c7c5
generated_at: 2026-11-14T17:23:14.806907+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/bundle-registry.ts

## Purpose

Central registry of every contract bundle this repo produces (authored specs and generated client collections). It exists so the CLI, the staleness check, and the cross-cutting test can all iterate one list instead of hard-coding bundle names in three places. Adding a new bundle is a single entry here plus its spec file.

## Key elements

- **`CONTRACT_BUNDLES`** (exported, `readonly ContractBundle[]`) — the ordered list of all bundles: `openapiBundle`, `asyncapiBundle`, `asyncapiPublicBundle`, `brunoBundle`. Every consumer iterates this array.
- **`findBundle(name)`** (exported) — resolves a single bundle by its CLI handle string; returns `undefined` if not found.
- **`collectionBundle(tool, file)`** (internal factory) — builds a `ContractBundle` entry for a generated client collection. Its `content` function uses a **dynamic** `import('./client-collections-bundle')` so app code is not loaded at bundle-definition time.
- **`brunoBundle`** (internal) — the concrete Bruno collection entry (`contract.bruno.yml`).
- **`export * from './bundle-kinds'`** — re-exports the `ContractBundle` type and any other kinds so consumers import from this file.

## Relationships

- **`scripts/contracts/bundle-kinds.ts`** — source of the `ContractBundle` type; all exports are re-exported through this file.
- **`scripts/contracts/openapi-bundle.ts`** — provides `openapiBundle`, the first entry in the registry.
- **`scripts/contracts/asyncapi-bundles.ts`** — provides `asyncapiBundle` (full) and `asyncapiPublicBundle` (subset for the paired frontend).
- **`scripts/contracts/client-collections-bundle.ts`** — dynamically imported inside `collectionBundle`'s `content` function; never imported statically.
- **`scripts/modules-on-disk.ts`** — supplies `REPO_ROOT` so generated files are written to the repo root.
- **`scripts/contracts/build-bundles.ts`** — the CLI build step that iterates `CONTRACT_BUNDLES` and calls each entry's `content()`.
- **`tests/cross-cutting/contract-bundles.test.ts`** — cross-cutting test that iterates the same list to verify output shape and staleness.

## Notes

- The dynamic import in `collectionBundle` is load-bearing: generated collections load app code that does not yet exist during `postinstall`. A dependency-cruiser rule (`contracts-bundler-loads-no-generated-code`) enforces that the import stays dynamic.
- Authored bundles (`openapi.yaml`, `asyncapi.yaml`) are `.gitignore`d and rebuilt on every install — identical to the generated ones. The paired frontend holds byte-identical copies and never edits them.
- `asyncapi.yaml` retains **every** channel (this repo's own types derive from it); `asyncapi.public.yaml` is the public subset delivered to the frontend.
- Generated collection files are written to the repo root as `contract.<tool>.<ext>` and kept out of VCS via `.gitignore`.
