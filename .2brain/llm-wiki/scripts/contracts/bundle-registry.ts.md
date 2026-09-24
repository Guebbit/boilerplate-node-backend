---
source: scripts/contracts/bundle-registry.ts
sha256: ae6ba6e27ca35ea106c46b4b4c77ff77fe3340bb610b64f91b59ce607b3415a5
generated_at: 2026-09-23T17:22:05.001530+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/bundle-registry.ts

## Purpose

Central registry of every contract bundle this repo produces. It is the single list that the CLI build, the staleness check, and the cross-cutting contract test all iterate, so adding a new bundle requires only one entry here plus its spec file.

## Key elements

- **`CONTRACT_BUNDLES`** (`readonly ContractBundle[]`) — the ordered list of all seven bundles: `openapiBundle`, `asyncapiBundle`, `asyncapiPublicBundle`, `brunoBundle`, `insomniaBundle`, `mockoonBundle`, `postmanBundle`.
- **`findBundle(name)`** — looks up a single bundle by its CLI handle (the `name` field). Returns `undefined` if not found.
- **`export * from './bundle-kinds'`** — re-exports the `ContractBundle` type and any other members so consumers only need to import from this file.

## Relationships

- **`scripts/contracts/bundle-kinds.ts`** — provides the `ContractBundle` type used to type the array; re-exported for downstream consumers.
- **`scripts/contracts/openapi-bundle.ts`** — source of `openapiBundle`.
- **`scripts/contracts/asyncapi-bundles.ts`** — source of `asyncapiBundle` and `asyncapiPublicBundle`.
- **`scripts/contracts/client-collections-bundle.ts`** — source of the four generated bundles (Bruno, Insomnia, Mockoon, Postman).
- **`scripts/contracts/build-bundles.ts`** — the CLI entry point that iterates `CONTRACT_BUNDLES` to build/output bundles.
- **`tests/cross-cutting/contract-bundles.test.ts`** — iterates `CONTRACT_BUNDLES` to assert invariants across all bundles.

## Notes

- **Authored vs. Generated:** The first three entries (OpenAPI, AsyncAPI, AsyncAPI-public) are _authored_ — committed to git and covered by the shared-identity check in `scripts/pairing/spec-identity.ts`. The last four (client collections) are _generated_ — listed here only so the CLI can find them by name; they are `.gitignore`d and therefore can never be "stale."
- **Subset publishing:** `asyncapiBundle` (full) is consumed by this repo's own types; `asyncapiPublicBundle` (public half) is what the frontend receives. Both live in this list but serve different audiences.
- **Order matters implicitly** only for test/CLI output ordering; there is no functional dependency between entries.
