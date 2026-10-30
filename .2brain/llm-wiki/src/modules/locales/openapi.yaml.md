---
source: src/modules/locales/openapi.yaml
sha256: e532b8ee1e8de1aa2eb6b9066732f9b2a03d79638d5852e0da3845d1f1b7d40a
generated_at: 2026-10-29T04:21:45.950714+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/openapi.yaml

## Purpose

OpenAPI 3.1.0 specification for the locales module. It defines the public contract (endpoints, request/response schemas, error codes) for managing deployment languages, their capabilities, and the two tiers of translation data (deployed API dictionaries vs. client-facing database rows). It exists so that clients, admin screens, and the API itself share a single source of truth for the locales surface.

## Key elements

- **`x-error-codes`** — 11 module-specific error codes (404/409/422) covering language CRUD conflicts, entry key validity, and unknown apps/entities. Each carries a human-readable description used in API error responses.
- **`tags`** — Declares the single `Locales` tag that all operations in this module attach to.
- **`GET /locales`** — Public, unauthenticated, cacheable. Returns per-language capabilities (`apps`, `active`, `actions`). Admins additionally see switched-off languages.
- **`POST /locales`** — Registers a new language in the dynamic (database) tier. Requires `bearerAuth` or `apiKeyAuth`.
- **`GET /locales/apps`** — Lists the translation apps (keyspaces) configured on the deployment. Public and cacheable.
- **`GET /locales/{locale}/dictionary`** — Serves the API's own tier-1 dictionary for one language. Intended for client-side fallback when no response arrives.
- **Extensive block comments** — Document the two-tier architecture, the `messages` vs. `entries` naming convention, the `{locale}`-in-path / `tag`-in-body distinction, and app keyspaces.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — This file `$ref`s that spec for shared components: the `Locale` path-parameter schema, standard error responses (`Unauthorized`, `Forbidden`, `Conflict`, `ValidationError`), and the `Location` header. The locales spec is a leaf in the root OpenAPI document.
- **`src/modules/locales/module.ts`** — The runtime module that loads/serves this spec (e.g., for request validation, route registration, or publishing the contract). This file is the declarative counterpart to the imperative code in `module.ts`.

## Notes

- The file is large because of descriptive prose in `description` fields and architecture comments. The comments are load-bearing: they explain *why* two tiers exist and *why* `messages` ≠ `entries`—information that is not recoverable from the schemas alone.
- `security: []` (empty array) on some GET endpoints means "no auth required" in OpenAPI terms, not "ignore security."
- The `Cache-Control` header documentation is inlined per endpoint rather than defined in a shared component, so caching expectations live in the response headers of each operation.
- The file references the `Locale` schema in the root spec rather than defining it locally; any change to the locale tag format must be made in `openapi.root.yaml`.
