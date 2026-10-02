---
source: scripts/scaffold/templates-contract.ts
sha256: 06fbc402b7188b2a1c6de3868cf2e79b8e24703f4b21ff30c6342f788b68ae34
generated_at: 2026-10-01T12:40:26.871316+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/templates-contract.ts

## Purpose

Generates the per-module `openapi.yaml` fragment (paths, responses, and component schemas) that the root assembler merges into the monorepo-wide OpenAPI bundle. It exists so that scaffolding a new module automatically produces a complete, spec-compliant contract with correct RFC 9110 (PUT) and RFC 7396 (PATCH) semantics, without hand-editing YAML.

## Key elements

- **`openapiFragment(names: ModuleNames): string`** *(export)* — The sole public export. Returns the full YAML text for a module's `openapi.yaml`, parameterised by the `ModuleNames` record (kebab name, entity casing, base path, etc.). Covers GET list, POST create, PUT replace, PATCH update, and DELETE.
- **`errorResponse(status, component)`** — Internal helper that formats a single indented `$ref` line pointing into the shared root contract's `responses` map.
- **`KEYED_ERRORS` / `KEYED_ERRORS_WITH_NOT_FOUND`** — Pre-joined response blocks (401/403/422/500, and +404) reused across operations to avoid repetition in the template literal.
- **`ROOT`** — Relative path (`../../../shared/contracts/openapi.root.yaml`) used in every cross-file `$ref` so the root assembler can resolve shared components (parameters, headers, envelope fields, pagination meta, error responses).

## Relationships

- **`scripts/scaffold/names.ts`** — Imports the `ModuleNames` type; all interpolations in the template are driven by its fields (`kebab`, `entity`, `entityCamel`, `plural`, `words`, `basePath`).
- **`scripts/scaffold/plan.ts`** — Listed as a graph neighbor; almost certainly the caller that invokes `openapiFragment` and writes the result into the scaffold output tree (this file is `@module` / side-effect-free, so `plan.ts` is the orchestration point).

## Notes

- **PUT vs PATCH schema distinction:** `Replace{Entity}Request` requires `name` and marks `notes` as `nullable: true` (omitting = clear). `Update{Entity}Request` makes *every* field optional (omitting = unchanged; explicit `null` = clear). Do not conflate the two when editing the template.
- **PATCH accepts two content types:** both `application/json` and `application/merge-patch+json` point to the same schema — a deliberate dual-mime for client convenience.
- **POST 201 carries a `Location` header** via a `$ref` into the root contract; the other success responses do not.
- **`notes` length differs by operation:** Create allows `maxLength: 5000` with no `minLength`; Replace and PATCH add `minLength: 1` (consistent with "if present, must be non-empty").
- **The file is a pure template generator** — no I/O, no side effects. Any change to the generated shape (e.g., adding a field to the entity) will silently affect every future scaffold unless the template is updated.
