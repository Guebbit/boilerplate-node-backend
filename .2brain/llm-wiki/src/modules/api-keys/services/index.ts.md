---
source: src/modules/api-keys/services/index.ts
source_sha256: 1c99a912276fc9d58dc4e97f3483d6898df867fa9a43283eced6532c2f82a5e2
context_sha256: f7229935dac1dcfafe44dc0ada21de68b3023a0f06cec1a5ea18b1e04740a4bc
generated_at: 2026-11-22T04:23:24.842560+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/services/index.ts

## Purpose
Barrel for the api-keys module's services. It combines the CRUD functions from `api-keys.ts` and the bearer-token credential resolver from `resolver.ts` into one `apiKeysService` object. The file's own doc comment says `module.ts` installs the `CredentialResolver` into the kernel.

## Key elements
- `apiKeysService` — the only export, and the module's single entry point. Its doc comment says controllers and sibling files should call through it rather than the bare functions. Members:
  - `listApiKeys` → `apiKeys.list`
  - `getApiKey` → `apiKeys.get`
  - `mintApiKey` → `apiKeys.mint`
  - `revokeApiKey` → `apiKeys.revoke`
  - `findOwnApiKeys` → `apiKeys.findOwnApiKeys`
  - `revokeAllMintedBy` → `apiKeys.revokeAllMintedBy`
  - `resolveApiKeyCredential` → `fromBearerToken` (from `./resolver`)

## Relationships
- `./api-keys` supplies the CRUD functions, imported as a namespace: `list`, `get`, `mint`, `revoke`, `findOwnApiKeys` and `revokeAllMintedBy`.
- `./resolver` supplies `fromBearerToken`, exposed as `resolveApiKeyCredential`.
- The controllers `delete-api-key.ts`, `get-api-key.ts`, `get-api-keys.ts` and `post-api-key.ts` are neighbors in the dependency graph. By the file's stated convention they reach the services through `apiKeysService`.
- `src/modules/api-keys/index.ts` is also a neighbor in the graph.

## Notes
- The file only re-maps names and holds no logic. Some members are renamed (`list` becomes `listApiKeys`, `mint` becomes `mintApiKey`), so look up the original names in `api-keys.ts`.
