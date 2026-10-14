---
source: scripts/scaffold/templates-contract.ts
sha256: 320323e946e242cfdc5e6b3bf94e419aa0286f4a09d26c193fc35a6eabb542ea
generated_at: 2026-10-14T07:31:37.877371+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/templates-contract.ts

## Purpose

Generates the complete `openapi.yaml` contract fragment for a scaffolded CRUD module. Given a set of entity names, it emits a self-contained OpenAPI 3.1 document (paths, responses, and component schemas) that references shared definitions (envelope fields, pagination, standard errors) from a root OpenAPI file. The output is designed to be assembled by a root bundler without further modification.

## Key elements

- **`openapiFragment(names: ModuleNames): string`** — the sole export. Returns the full YAML text for a module's `openapi.yaml`, containing five paths (list, create, replace, patch, delete) and the component schemas those paths reference.
- **`ROOT`** — relative path (`../../../shared/contracts/openapi.root.yaml`) to the shared OpenAPI components that all `$ref`s point into.
- **`errorResponse(status, component)`** — builds a single indented `$ref` line for a standard error response.
- **`KEYED_ERRORS`** — pre-joined 401/403/422/500 response block for routes with a request body or query params.
- **`KEYED_ERRORS_WITH_NOT_FOUND`** — same as above plus a 404, for `{id}`-parameterized routes.
- **`PATH_ONLY_ERRORS`** — 401/403/404/500 (no 422) for the `DELETE` route, which has no body or query to validate.

## Relationships

- **`scripts/scaffold/names.ts`** — imports the `ModuleNames` type; all template substitutions (`names.kebab`, `names.entity`, `names.basePath`, etc.) come from that type.
- **`scripts/scaffold/plan.ts`** — consumes `openapiFragment` as the contract template when producing the scaffold plan for a new module.

## Notes

- The template literal's own indentation *is* the YAML indentation. If you reflow the source, the emitted YAML will break.
- `PATCH` accepts both `application/json` and `application/merge-patch+json` with the same schema (RFC 7396 semantics); `PUT` uses RFC 9110 full-replacement semantics where `name` is genuinely required.
- The `notes` field uses `type: [string, 'null']` in both `Replace*Request` and `Update*Request`, so an explicit `null` clears it while omission leaves it unchanged.
- All `components.schemas` use `additionalProperties: false`; the shared root file is the only place where envelope fields (`success`, `status`, `message`) and `PaginationMeta` are defined.
