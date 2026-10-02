---
source: scripts/contracts/bundle-registry.ts
sha256: 20e4e39343b0900a61291e6fc663b28c32744b536a7770821fd2db5384e5efb0
generated_at: 2026-10-01T12:25:57.538250+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/bundle-registry.ts

## Purpose

Central registry of every contract document the repo produces. It defines the complete list of bundles (spec + client-collection artifacts) so that the CLI, the staleness check, and the cross-cutting test can all iterate a single source of truth. Adding a new bundle is one entry here plus its spec file.

## Key elements

- **`CONTRACT_BUNDLES`** – `readonly ContractBundle[]` (typed `as const`). The ordered list of all seven bundles: `openapiBundle`, `asyncapiBundle`, `asyncapiPublicBundle`, `brunoBundle`, `insomniaBundle`, `mockoonBundle`, `postmanBundle`.
- **`findBundle(name)`** – Looks up a single bundle by its CLI handle (string name); returns `ContractBundle | undefined`.
- **Re-exports `./bundle-kinds`** – Makes the `ContractBundle` type and any other exports from `bundle-kinds` available to consumers of this module.

## Relationships

- **`bundle-kinds.ts`** – Defines the `ContractBundle` type that this file imports and uses to type the registry array; also re-exported downstream.
- **`openapi-bundle.ts`** – Supplies `openapiBundle` (the GENERATED `openapi.yaml` entry, `.gitignore`d and rebuilt on install).
- **`asyncapi-bundles.ts`** – Supplies `asyncapiBundle` (full) and `asyncapiPublicBundle` (public half, committed to the paired frontend).
- **`client-collections-bundle.ts`** – Supplies `brunoBundle`, `insomniaBundle`, `mockoonBundle`, `postmanBundle` (GENERATED client-collection files listed so the CLI can find them by name).
- **`build-bundles.ts`** – Consumes `CONTRACT_BUNDLES` to drive the build pipeline.
- **`tests/cross-cutting/contract-bundles.test.ts`** – Iterates `CONTRACT_BUNDLES` to assert invariants across all bundles.

## Notes

- Two semantic classes exist but are not encoded as a discriminator field: **AUTHORED** bundles (`asyncapi.yaml`, `asyncapi.public.yaml`) are committed and guarded by the staleness check; **GENERATED** bundles (`openapi.yaml`, client collections) are uncommitted, rebuilt on every install, and listed only so the CLI can resolve them by name. An uncommitted file cannot be stale.
- `asyncapi.yaml` is the superset; `asyncapi.public.yaml` is the subset published to the paired frontend (which holds byte-identical copies and never edits them).
- Order in the array is the CLI's display order; the cross-cutting test and staleness check are order-insensitive but rely on the list being exhaustive.
