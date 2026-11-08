---
source: src/modules/api-keys/services/index.ts
sha256: 1c99a912276fc9d58dc4e97f3483d6898df867fa9a43283eced6532c2f82a5e2
generated_at: 2026-11-08T05:04:28.884175+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/services/index.ts

## Purpose

Barrel (facade) file for the api-keys service layer. It re-exports the CRUD functions from `api-keys.ts` and the bearer-token resolver from `resolver.ts` under a single, unified `apiKeysService` object so that controllers and other module code interact with one consistent door rather than reaching into individual service files.

## Key elements

- **`apiKeysService`** (exported const object) — the sole public API surface of the service layer. Maps friendly names to underlying implementations:
  - `listApiKeys` → `apiKeys.list`
  - `getApiKey` → `apiKeys.get`
  - `mintApiKey` → `apiKeys.mint`
  - `revokeApiKey` → `apiKeys.revoke`
  - `findOwnApiKeys` → `apiKeys.findOwnApiKeys`
  - `revokeAllMintedBy` → `apiKeys.revokeAllMintedBy`
  - `resolveApiKeyCredential` → `fromBearerToken` (from `./resolver`)
- **`import * as apiKeys from './api-keys'`** — pulls in the CRUD resource functions.
- **`import { fromBearerToken } from './resolver'`** — pulls in the `CredentialResolver` helper installed into the kernel.

## Relationships

- **`services/api-keys.ts`** — source of all CRUD functions (`list`, `get`, `mint`, `revoke`, `findOwnApiKeys`, `revokeAllMintedBy`). This file wraps them under `apiKeysService`.
- **`services/resolver.ts`** — provides `fromBearerToken`, exposed here as `apiKeysService.resolveApiKeyCredential`.
- **Controllers** (`post-api-key`, `get-api-key`, `get-api-keys`, `delete-api-key`) — import `apiKeysService` from this barrel to perform their respective operations; they never import `api-keys.ts` or `resolver.ts` directly.
- **`src/modules/api-keys/index.ts`** — the module entry point; re-exports or wires up `apiKeysService` for kernel registration.

## Notes

- This file is deliberately the *only* import surface for service logic. The doc comment states controllers and siblings should "never" call the bare functions directly, enforcing a single choke-point for refactoring or testing.
- The mapping renames internal verbs (`list`, `get`, `mint`, `revoke`) to longer, self-documenting names (`listApiKeys`, `getApiKey`, …) so callers read naturally without needing a namespace qualifier.
