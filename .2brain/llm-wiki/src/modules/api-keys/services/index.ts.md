---
source: src/modules/api-keys/services/index.ts
sha256: 1c99a912276fc9d58dc4e97f3483d6898df867fa9a43283eced6532c2f82a5e2
generated_at: 2026-10-29T03:14:52.519492+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/services/index.ts

## Purpose

Barrel module for the `api-keys` service layer. It re-exports the CRUD operations from `api-keys.ts` and the credential resolver from `resolver.ts` under a single, consistently-named `apiKeysService` object so that callers have exactly one entry point instead of reaching into individual service files.

## Key elements

- **`apiKeysService`** (exported const object) — the sole public export. Maps descriptive method names to their implementations:
  - `listApiKeys` → `apiKeys.list`
  - `getApiKey` → `apiKeys.get`
  - `mintApiKey` → `apiKeys.mint`
  - `revokeApiKey` → `apiKeys.revoke`
  - `findOwnApiKeys` → `apiKeys.findOwnApiKeys`
  - `revokeAllMintedBy` → `apiKeys.revokeAllMintedBy`
  - `resolveApiKeyCredential` → `fromBearerToken` (from `resolver.ts`)

## Relationships

- **`services/api-keys.ts`** — source of all CRUD methods (`list`, `get`, `mint`, `revoke`, `findOwnApiKeys`, `revokeAllMintedBy`). This file imports the whole module and re-exposes selected members.
- **`services/resolver.ts`** — provides `fromBearerToken`, the credential-resolution function installed into the kernel. Re-exported here as `resolveApiKeyCredential`.
- **`controllers/get-api-key.ts`**, **`controllers/list-api-keys.ts`**, **`controllers/mint-api-key.ts`**, **`controllers/revoke-api-key.ts`** — all call through `apiKeysService` rather than importing `api-keys.ts` or `resolver.ts` directly.
- **`src/modules/api-keys/index.ts`** — the module root; registers the service with the kernel and wires the controllers.

## Notes

- The doc comment states controllers and sibling modules should call through `apiKeysService` and *never* the bare functions from `api-keys.ts` or `resolver.ts` directly. Treat this file as the only import path for service operations.
- The resolver is imported as a single named function (`fromBearerToken`), not as a namespace, which differs from the `* as apiKeys` pattern used for the CRUD file.
