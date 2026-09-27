---
source: scripts/contracts/bundle-registry.ts
sha256: 2c67dccee3648a5af169dd244b0300c6b0358af5a2385c06ee0d45506619c626
generated_at: 2026-09-27T13:52:41.147743+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/bundle-registry.ts

## Purpose

Central registry of every contract bundle this repo publishes. It is the single source of truth that the build CLI, the staleness guard, and the cross-cutting test all iterate over, so adding a bundle requires one entry here plus its spec file.

## Key elements

- **`CONTRACT_BUNDLES`** — `readonly ContractBundle[]` containing all seven bundles: `openapiBundle`, `asyncapiBundle`, `asyncapiPublicBundle`, `brunoBundle`, `insomniaBundle`, `mockoonBundle`, `postmanBundle`. Declared `as const` for literal-tuple inference.
- **`findBundle(name: string)`** — looks up a single bundle by its CLI handle string; returns `undefined` if not found.
- **`export * from './bundle-kinds'`** — re-exports the `ContractBundle` type (and any other kind-level exports) so consumers can import everything from this one file.

## Relationships

- **`bundle-kinds.ts`** — provides the `ContractBundle` type that every entry in `CONTRACT_BUNDLES` must satisfy; its exports are re-exported here.
- **`openapi-bundle.ts`** — supplies `openapiBundle`, the first (authored) entry.
- **`asyncapi-bundles.ts`** — supplies `asyncapiBundle` (full channel set, kept because this repo's own types derive from it) and `asyncapiPublicBundle` (the public subset handed to the frontend).
- **`client-collections-bundle.ts`** — supplies the four GENERATED bundles (Bruno, Insomnia, Mockoon, Postman); these are `.gitignore`d and listed only so the CLI can resolve them by name.
- **`build-bundles.ts`** — consumes `CONTRACT_BUNDLES` (and `findBundle`) to drive the actual build/orchestration.
- **`tests/cross-cutting/contract-bundles.test.ts`** — iterates `CONTRACT_BUNDLES` to assert invariants (naming, authored-vs-generated classification, etc.) across every registered bundle.

## Notes

- Two bundle categories exist: **AUTHORED** (committed, byte-identical copies shared with the paired frontend via `scripts/pairing/spec-identity.ts`) and **GENERATED** (`.gitignore`d client collections, listed solely for CLI name resolution). A generated file cannot be stale because it is uncommitted.
- `asyncapiBundle` (full) and `asyncapiPublicBundle` (public subset) are intentionally separate entries; the full one is retained because this repo's own TypeScript types are derived from it.
- The file is deliberately trivial by design: the header comment states that adding a bundle is "one entry here plus its spec file," and every downstream consumer (CLI, staleness check, cross-cutting test) iterates `CONTRACT_BUNDLES` rather than hard-coding names.
