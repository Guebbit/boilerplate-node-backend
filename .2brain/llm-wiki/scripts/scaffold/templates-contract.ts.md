---
source: scripts/scaffold/templates-contract.ts
sha256: 348aa22070c657ef035c885000f4e5c2152910c8cbaf681d871e89834f553d7d
generated_at: 2026-10-29T01:44:30.241047+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/templates-contract.ts

## Purpose

Generates the per-module `openapi.yaml` fragment (paths, tags, and module-local schemas) that the scaffold drops into a new module folder. The root assembler later stitches these fragments into the root OpenAPI bundle; this file is responsible only for the module's own contract text, with shared components (errors, pagination, headers, ID) referenced via `$ref` to a central root document.

## Key elements

- **`ROOT`** — Relative path (`../../../shared/contracts/openapi.root.yaml`) to the shared OpenAPI root document; every cross-module `$ref` uses this prefix.
- **`errorResponse(status, component)`** — Helper that produces a single indented `$ref` line for an error response entry in the YAML responses map.
- **`KEYED_ERRORS`** — Pre-joined YAML block for 401 / 403 / 422, used by list, create, and replace/patch routes.
- **`KEYED_ERRORS_WITH_NOT_FOUND`** — Same set plus 404; used by `PUT /{id}` and `PATCH /{id}` where a missing entity is a valid outcome.
- **`PATH_ONLY_ERRORS`** — 401 / 403 / 404 only (no 422); used by `GET /{id}` and `DELETE /{id}` which accept no body/query.
- **`openapiFragment(names: ModuleNames): string`** — The sole export. Interpolates the `ModuleNames` fields (kebab, entity, entityCamel, plural, words, basePath) into a full OpenAPI 3.1.0 document covering six operations (list, create, get, replace, update, delete) and all module-local component schemas (entity, entityActions, list response, sort enum, create/replace/update request bodies).

## Relationships

- **`scripts/scaffold/names.ts`** — Imports the `ModuleNames` type. Every interpolated name (entity, plural, words, basePath, kebab, entityCamel) comes from that type; the template is a pure function of a `ModuleNames` value.
- **`scripts/scaffold/plan.ts`** — Upstream orchestrator that calls `openapiFragment` with the resolved names and writes the resulting string to the module's `openapi.yaml`.

## Notes

- The generated YAML is **indented with 4 spaces** (not the standard 2-space YAML style); this is intentional and matches the rest of the codebase's generated files.
- `PUT` vs `PATCH` semantics are encoded in the schemas: `Replace…Request` requires `name` (full representation, RFC 9110 §9.3.4); `Update…Request` makes every field optional and allows `notes: null` to clear it (RFC 7396 merge-patch).
- The `PATCH` operation advertises **both** `application/json` and `application/merge-patch+json` content types, both pointing to the same schema.
- The `actions` object on the entity is a server-computed permission hint (update/delete booleans) so clients can render controls without re-implementing authz logic.
- The sort parameter is constrained to a fixed enum (`createdAt, -createdAt, name, -name`, max 3 items) — adding a new sortable field requires editing the template here.
- The file is `@module`-scoped; it has no side effects and no runtime imports beyond the type.
