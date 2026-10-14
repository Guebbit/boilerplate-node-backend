---
source: src/modules/api-keys/services/index.ts
sha256: 7b0704715bbb3f21c4e9ac8c5748cad031638e7f8a5d3d5a8c8b3e5e2869b841
generated_at: 2026-10-14T15:01:14.601007+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/services/index.ts

## Purpose

Barrel (index) file for the api-keys services layer. It re-exports the CRUD functions from `api-keys.ts` under a single namespaced object and surfaces the credential resolver from `resolver.ts`, giving controllers and the module installer one stable import point.

## Key elements

- **`apiKeysService`** — exported object bundling `listApiKeys`, `mintApiKey`, and `revokeApiKey` (mapped from the internal `list`, `mint`, `revoke` functions in `./api-keys`). Controllers call through this object rather than importing bare functions.
- **`resolveApiKeyCredential`** — re-export of `fromBearerToken` from `./resolver`; used to extract an API-key credential from a request's `Authorization` header.
- **`findOwnApiKeys`** — re-exported from `./api-keys`; retrieves keys belonging to a specific user.
- **`revokeAllMintedBy`** — re-exported from `./api-keys`; bulk-revokes all keys minted by a given entity.

## Relationships

- **Consumed by** `controllers/list-api-keys.ts`, `controllers/mint-api-key.ts`, and `controllers/revoke-api-key.ts` — each controller imports the relevant method from `apiKeysService` (or the direct re-exports) rather than reaching into `./api-keys` directly.
- **Wraps** `services/api-keys.ts` — all CRUD logic lives there; this file only renames and re-exports.
- **Re-exports from** `services/resolver.ts` — the `CredentialResolver` that `module.ts` (in `src/modules/api-keys/index.ts`) installs into the kernel.

## Notes

- The internal function names (`list`, `mint`, `revoke`) are intentionally renamed to longer, self-descriptive names on export (`listApiKeys`, `mintApiKey`, `revokeApiKey`). Don't import by the short names from this file.
- Per the in-code comment, controllers should call through `apiKeysService` and never import the bare functions from `./api-keys` directly; this file is the single public surface.
- The resolver (`fromBearerToken`) is a *credential extraction* utility, not a CRUD operation — it is exposed separately from `apiKeysService` because it has a different call-site (kernel credential resolution) and different shape.
