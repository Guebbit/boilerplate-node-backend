---
source: src/modules/api-keys/services/index.ts
sha256: 3fb7af2c1ad2e1bc806026198edcfa6981b87520b190bafe65999f617f73f8f0
generated_at: 2026-09-27T14:41:35.336170+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/services/index.ts

## Purpose

Barrel file for the `api-keys` module's service layer. It gives controllers and the module index a single, stable import surface (`apiKeysService`) rather than exposing the individual CRUD functions directly, and it re-exports the credential resolver under a domain-specific name.

## Key elements

- **`apiKeysService`** (const object) — The sole export controllers are expected to use. Wraps three functions from `./api-keys`:
  - `listApiKeys` → delegates to `apiKeys.list`
  - `mintApiKey` → delegates to `apiKeys.mint`
  - `revokeApiKey` → delegates to `apiKeys.revoke`
- **`resolveApiKeyCredential`** — Re-export of `fromBearerToken` from `./resolver`; the `CredentialResolver` the kernel installs at startup.
- **`findOwnApiKeys`** — Direct re-export from `./api-keys`; used for per-user key lookups (e.g. in UI or auth flows) that bypass the controller-facing service object.

## Relationships

- **Consumed by** `controllers/list-api-keys.ts`, `controllers/mint-api-key.ts`, `controllers/revoke-api-key.ts` — each controller imports `apiKeysService` from this barrel and calls the corresponding method.
- **Re-exports from** `services/api-keys.ts` (the actual CRUD implementation) and `services/resolver.ts` (token parsing / credential resolution).
- **Re-exported by** `src/modules/api-keys/index.ts`, which surfaces these names at the module top level.

## Notes

- Controllers must import through `apiKeysService` (the object), **not** by reaching into `./api-keys` directly. The doc comment makes this explicit; treat it as a convention enforced by review rather than by lint.
- `findOwnApiKeys` is the one function exported *outside* the `apiKeysService` object. If you need a new consumer-facing function, decide whether it belongs on the service object or as a standalone re-export.
