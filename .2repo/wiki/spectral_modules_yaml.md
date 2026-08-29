# spectral.modules.yaml

## Purpose

Spectral linter config for linting a single module's OpenAPI contract in isolation (`npm run lint:openapi:modules`). It disables the subset of rules that assume a file is the *entire* API (tag registry, security schemes, servers, `info` prose), because those concerns live in the root contract, while every other rule inherited from the main config still applies.

## Key elements

- **`extends: './spectral.yaml'`** — inherits the full rule set from the main Spectral configuration.
- **`operation-tag-defined: off`** — tags are declared once in the root; a module's operations reference them without redefining the list.
- **`oas3-operation-security-defined: off`** — `bearerAuth` (and any other schemes) are declared in the root's `components.securitySchemes`.
- **`oas3-api-servers: off`** — server URLs describe the deployment, not a domain.
- **`info-contact: off` / `info-description: off`** — a module's `info` block exists only to keep the file a valid standalone OpenAPI document.

## Relationships

- **`spectral.yaml`** — parent config; every rule not explicitly overridden here is inherited from it. The bundled `openapi.yaml` is linted against `spectral.yaml` directly, where the five rules above remain **on**.
- **`shared/contracts/openapi.root.yaml`** — the root contract that owns the tag list, security schemes, servers, and `info` prose. This config's disabled rules exist precisely because those elements are declared here, once, rather than repeated per module.

## Notes

- This config is **not** used for the final bundle. Running `npm run lint:openapi` targets `openapi.yaml` with `spectral.yaml`, where a missing tag or undeclared scheme *is* a real defect.
- The module files it lints (`src/modules/<name>/openapi.yaml`) are complete, valid OpenAPI documents (openable in Redoc/Stoplight) but intentionally omit deployment-level metadata.
- The repo's own custom rules (operationId conventions, envelope rules) are **not** among the disabled rules and apply to modules unchanged.
