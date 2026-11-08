---
source: shared/contracts/spectral.modules.yaml
sha256: 3c8083d03b28f358b37d57acb46fc991514c04f835fce68573e6c9f666d8d52a
generated_at: 2026-11-08T03:08:17.140799+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/spectral.modules.yaml

## Purpose

Spectral lint configuration used when validating a **single module's** `openapi.yaml` in isolation (`npm run lint:openapi:modules`). It relaxes the rules that expect a document to be a complete API, because deployment-level concerns (tag catalogue, security schemes, servers, `info` prose) live in the root contract, not in each module fragment.

## Key elements

- **`extends: './spectral.yaml'`** — Inherits the full rule set used for the bundled contract, then overrides a subset.
- **`operation-tag-defined: off`** — The complete tag list is assembled in the root from each module's local `tags:` / `x-family`; a module need not restate it.
- **`oas3-operation-security-defined: off`** — `bearerAuth` is declared once in the root's `components.securitySchemes`; modules may reference it without redefining it.
- **`oas3-api-servers: off`** — Servers are a deployment concern, not a domain concern.
- **`info-contact: off`** — Contact metadata is deployment prose, not module content.
- **`info-description: off`** — API description is deployment prose; a module's `info` block exists only to satisfy OpenAPI document validity.

## Relationships

- **`shared/contracts/spectral.yaml`** — This file extends it, inheriting all rules (including repo-specific `operationId` and success-body rules) and then selectively disabling the five listed above.
- **`shared/contracts/openapi.root.yaml`** — The root contract where the global `tags`, `securitySchemes`, `servers`, and `info` are declared. The rules turned off here exist precisely because those declarations live in the root rather than being repeated in every module file.

## Notes

- The rules disabled here remain **active** for the full bundle (`npm run lint:openapi`, which runs `spectral.yaml` against the combined `openapi.yaml`). A missing tag or undeclared scheme is still a real defect in the assembled document.
- A module's `info` block is a placeholder for document validity, not a source of truth for API metadata.
