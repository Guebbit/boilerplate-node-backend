---
source: shared/contracts/spectral.modules.yaml
source_sha256: 3c8083d03b28f358b37d57acb46fc991514c04f835fce68573e6c9f666d8d52a
context_sha256: 07edcb200ce187179749cb4085b6a136ea37d212ad26794889abe90d7a618cbd
generated_at: 2026-11-22T02:24:33.052320+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/contracts/spectral.modules.yaml

## Purpose
Spectral ruleset for linting a single module's OpenAPI document (`src/modules/<name>/openapi.yaml`) on its own, run via `npm run lint:openapi:modules`. A module file is a valid OpenAPI document but not a complete API, so this ruleset relaxes the rules that expect a document to describe the whole deployment.

## Key elements
- `extends: ./spectral.yaml`: inherits the repo's full ruleset, including its own operationId and success-body rules, unchanged.
- `operation-tag-defined: off`: the tag list is assembled in the root from each module's `tags:` (with `x-family`), so a module need not carry the root's list.
- `oas3-operation-security-defined: off`: `bearerAuth` is declared once in the root's `components.securitySchemes`.
- `oas3-api-servers: off`, `info-contact: off`, `info-description: off`: servers and API description belong to the deployment. A module's `info` block exists only to make the file a valid document.

## Relationships
- `shared/contracts/spectral.yaml`: the base ruleset this file extends. The same ruleset is also used by `npm run lint:openapi` against the bundle, where all rules stay on.
- `shared/contracts/openapi.root.yaml`: declares the tags, security schemes, servers and `info` prose that the disabled rules would otherwise demand of each module.

## Notes
- Only the rules that ask a module to be the whole API are disabled. Missing tags or undeclared schemes still count as defects when the bundle is linted.
- Changes to shared rules belong in `spectral.yaml`. Add an override here only when a rule is about completeness of the whole API.
