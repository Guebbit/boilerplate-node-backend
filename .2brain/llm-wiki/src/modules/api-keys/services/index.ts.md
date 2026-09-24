---
source: src/modules/api-keys/services/index.ts
sha256: ecc3b26bbda2bdde3656b2e0bb2cde2f8351a12a85d7c904bc738a9637078ae3
generated_at: 2026-09-23T18:25:25.788483+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/services/index.ts

## Purpose

Barrel (re-export) file for the `api-keys` module's `services/` directory. It exposes a single `apiKeysService` object that maps the module's three operations to their implementations in `./api-keys.ts`, giving controllers one stable import surface instead of reaching into individual service functions.

## Key elements

- **`apiKeysService`** – The sole export. An object with three keys that alias functions from `./api-keys`:
  - `listApiKeys` → `apiKeys.list`
  - `mintApiKey` → `apiKeys.mint`
  - `revokeApiKey` → `apiKeys.revoke`

## Relationships

- **Imports** `src/modules/api-keys/services/api-keys.ts` — the actual implementation of `list`, `mint`, and `revoke`.
- **Imported by** the three controllers (`list-api-keys.ts`, `mint-api-key.ts`, `revoke-api-key.ts`), which call the mapped methods on `apiKeysService` rather than importing bare functions directly.
- **Re-exported through** `src/modules/api-keys/index.ts` for any consumer outside the module's own directory.

## Notes

- The JSDoc explicitly states controllers must call through `apiKeysService` and never the underlying bare functions. Treat this indirection as a hard convention.
- The file exists purely as a namespace/alias layer; it adds no logic. Any bug in an operation should be traced to `./api-keys.ts`, not here.
