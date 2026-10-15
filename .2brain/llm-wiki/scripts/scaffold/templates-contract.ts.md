---
source: scripts/scaffold/templates-contract.ts
sha256: 9251888ca4e90b89eb9522485ecfe44c98fc65ee81a2736d25dba9adc0af2553
generated_at: 2026-10-15T09:47:50.999333+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/templates-contract.ts

## Purpose

Generates the per-module `openapi.yaml` fragment for a scaffolded entity module. It produces a self-contained OpenAPI 3.1.0 document (paths + local component schemas) that a root assembler can merge into the top-level bundle without further modification. The file exists so that each generated module ships a valid, spec-complete contract out of the box.

## Key elements

- **`openapiFragment(names: ModuleNames): string`** — The sole export. Takes the module's naming spellings and returns the full YAML text for the module's `openapi.yaml`.
- **`ROOT`** (const) — Relative path (`../../../shared/contracts/openapi.root.yaml`) used in every `$ref` that points to shared components (parameters, responses, headers, base schemas).
- **`errorResponse(status, component)`** (const helper) — Produces a single indented `$ref` line for an error response entry.
- **`KEYED_ERRORS`** — 401 / 403 / 422 / 500 response block, used by list, create, replace, and update.
- **`KEYED_ERRORS_WITH_NOT_FOUND`** — Same plus 404; used by replace and update (routes with an `{id}` parameter).
- **`PATH_ONLY_ERRORS`** — 401 / 403 / 404 / 500 (no 422, no body to validate); used by delete.
- **Generated paths** — `GET {basePath}` (list), `POST {basePath}` (create), `PUT {basePath}/{id}` (replace), `PATCH {basePath}/{id}` (update), `DELETE {basePath}/{id}` (delete).
- **Generated component schemas** — `{Entity}Envelope`, `{Plural}ResponseEnvelope`, `{Plural}Response`, `{Entity}`, `Create{Entity}Request`, `Replace{Entity}Request`, `Update{Entity}Request`.

## Relationships

- **`scripts/scaffold/names.ts`** — Provides the `ModuleNames` type (imported via `import type`). All name interpolations (`names.kebab`, `names.entity`, `names.plural`, `names.basePath`, etc.) come from that module.
- **`scripts/scaffold/plan.ts`** — Consumes the string returned by `openapiFragment` and writes it to disk as the module's `openapi.yaml` during the scaffold run.

## Notes

- The PATCH route declares **two** `requestBody` content types: `application/json` and `application/merge-patch+json`, both pointing to the same `Update{Entity}Request` schema.
- PUT semantics are documented as RFC 9110 §9.3.4 (omitted optional field is cleared); PATCH semantics as RFC 7396 (omitted = unchanged, `null` clears `notes`). The request schemas encode this: `Replace*Request` requires `name` and allows `null` for `notes`; `Update*Request` requires nothing and also allows `null` for `notes`.
- All `$ref`s to shared components use a **relative** path (`ROOT`), not an absolute or workspace URL. The fragment is expected to be placed two levels below the `shared/contracts/` directory.
- The `notes` field in `Update{Entity}Request` and `Replace{Entity}Request` uses the YAML type union `[string, 'null']`; the create request does not allow `null` (field is simply omitted or a string).
- Every schema sets `additionalProperties: false`, making the generated contract strict.
