---
source: shared/contracts/spectral.modules.yaml
sha256: 6bfa51f33abf3e8f7772516f1c6b274dfdce5b3ce98e264aeb933b3d52982d24
generated_at: 2026-09-23T17:34:23.153985+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/spectral.modules.yaml

## Purpose

Spectral ruleset for linting a single module's OpenAPI file (`src/modules/<name>/openapi.yaml`) in isolation. It inherits the full rule set from the base config and selectively disables the rules that presuppose a single file is the entire API, since cross-cutting concerns (tags, security schemes, servers, info prose) are declared once in the root contract.

## Key elements

- **`extends: './spectral.yaml'`** — pulls in every rule the repo uses for the bundled contract.
- **`rules` overrides** — five rules set to `off`, each with a comment explaining *why* the module is exempt:
  - `operation-tag-defined` — tag list lives in the root, not repeated per module.
  - `oas3-operation-security-defined` — `bearerAuth` is declared in the root's `components.securitySchemes`.
  - `oas3-api-servers` — server URLs are a deployment concern, owned by the root.
  - `info-contact` / `info-description` — module `info` exists only to satisfy the OpenAPI schema; the real description is in the root.

## Relationships

- **`shared/contracts/spectral.yaml`** — parent config. All rules not explicitly turned off here are inherited unchanged (including the repo's custom `operationId` and envelope rules).
- **`shared/contracts/openapi.root.yaml`** — the document where the tags, security schemes, servers, and `info` block referenced by the disabled rules actually live. A module passes lint here but would fail if those fields were missing from the root.
- **`shared/contracts/spectral.asyncapi.modules.yaml`** — sibling ruleset for AsyncAPI module files; mirrors the same "module-is-not-the-whole-API" pattern for a different spec format.

## Notes

- This file is invoked by `npm run lint:openapi:modules`. The bundled lint (`npm run lint:openapi`) uses `spectral.yaml` directly against `openapi.yaml`, where the disabled rules remain **on** and a missing tag or undeclared scheme is a real defect.
- The per-rule comments document *why* each rule is off; if you add a new module-level rule to `spectral.yaml`, check whether it also presupposes a whole-API context and disable it here if so.
