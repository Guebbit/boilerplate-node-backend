---
source: scripts/scaffold/templates-contract.ts
sha256: 0b06602280208547900d6f851ea9dc7db7d59a5459354045538c7d5c8e24b5b9
generated_at: 2026-11-08T03:01:20.994322+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/templates-contract.ts

## Purpose

Generates the per-module `openapi.yaml` fragment that the scaffold produces for a new API resource. It emits a self-contained OpenAPI 3.1.0 document (paths, tags, schemas) whose shared components (`$ref`s to pagination, errors, auth, etc.) are resolved by the root assembler at build time. The template bakes in the project's REST conventions so every scaffolded module ships with a consistent contract without hand-authoring YAML.

## Key elements

- **`openapiFragment(names: ModuleNames, group: string): string`** — the sole export. Takes the module's naming set and its group (for the tag family) and returns the full `openapi.yaml` text. Covers six operations: `GET` list, `POST` create, `GET`/`PUT`/`PATCH`/`DELETE` by id.
- **`ROOT`** (const) — the relative path (`../../../shared/contracts/openapi.root.yaml`) every cross-module `$ref` uses; module YAML is placed three levels below the shared contracts folder.
- **`errorResponse(status, component)`** — one-line helper that formats a single error-response entry indented for a `responses` map.
- **`KEYED_ERRORS` / `KEYED_ERRORS_WITH_NOT_FOUND` / `PATH_ONLY_ERRORS`** — pre-joined blocks of the three or four error lines each route variant needs (401, 403, 404, 422), chosen per route shape.
- **Inline schemas** (emitted into `components/schemas`): `…Response` (paginated list), `…Sort` (JSON:API sort array), the entity object (with server-driven `actions` booleans), `Create…Request`, `Replace…Request` (PUT, name required), `Update…Request` (PATCH, all fields optional, `null` clears `notes`).

## Relationships

- **`scripts/contracts/fragments.ts`** — provides `TAG_FAMILY_OF_GROUP`, which maps a module's group string to the `x-family` value placed on the tag. This is the only import from that file.
- **`scripts/scaffold/names.ts`** — provides the `ModuleNames` type (the naming/wording bundle: `kebab`, `entity`, `entityCamel`, `plural`, `words`, `basePath`). This file consumes it as the sole input to `openapiFragment`.

## Notes

- The sort schema hardcodes the sortable fields to `createdAt` and `name` (with negated variants). A scaffolded module with different sortable fields must edit the generated YAML after scaffolding.
- `PATCH` declares both `application/json` and `application/merge-patch+json` as request content types, both pointing to the same `Update…Request` schema.
- The `actions` object on the entity is a server-computed permission hint (`update`, `delete` booleans); it is not an input the client sends.
- All shared-component references (pagination params, error responses, `Location` header, `NoContent`, `Id`, `PaginationMeta`) use `$ref` into the root file; this file never inlines their definitions.
