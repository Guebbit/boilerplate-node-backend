---
source: shared/contracts/spectral.modules.yaml
sha256: f6379f53f0cce60cf654b9aa791304db28277b8847baa51ac26265128ae72fce
generated_at: 2026-10-29T01:47:38.050989+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/spectral.modules.yaml

## Purpose

Spectral linting configuration for individual module OpenAPI files (`src/modules/<name>/openapi.yaml`). It relaxes the rules that assume a file describes an entire deployed API (global tags, security schemes, servers, `info` prose) because those concerns are declared once in the root contract rather than restated by every module. Used by `npm run lint:openapi:modules`.

## Key elements

- **`extends: ./spectral.yaml`** — inherits all base lint rules (including repo-specific `operationId` and success-body rules) so modules get the same baseline checks as the bundle.
- **`operation-tag-defined: off`** — a module may reference a tag (e.g. `Products`) without redeclaring the `tags:` array; the canonical list lives in the root.
- **`oas3-operation-security-defined: off`** — operations may reference `bearerAuth` without the module declaring the scheme; it is defined once in the root's `components.securitySchemes`.
- **`oas3-api-servers: off`** — a module need not declare `servers`; that is a deployment concern.
- **`info-contact: off` / `info-description: off`** — a module's `info` block exists only to satisfy the OpenAPI schema; meaningful prose belongs to the root.

## Relationships

- **`shared/contracts/spectral.yaml`** — parent ruleset; this file inherits every rule it defines and overrides only the five listed above.
- **`shared/contracts/openapi.root.yaml`** — the single source of truth for the tag list, security schemes, servers, and API description that this config stops requiring per-module.
- **`shared/contracts/spectral.asyncapi.modules.yaml`** — sibling config applying the same "module-level relaxation" pattern to AsyncAPI module files.

## Notes

- These rules are intentionally **ON** in `spectral.yaml` (the bundle config). A missing tag or undeclared scheme in the final `openapi.yaml` is a real defect; the same rule is only suppressed at the module level because the information lives elsewhere.
- The distinction is structural, not permissive: a module must still be a *valid* OpenAPI document (it can be opened in an editor standalone), just not a *complete* API description.
