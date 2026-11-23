---
source: scripts/scaffold/templates-contract.ts
source_sha256: 1f75303fde189c2fff16c0b203b92631bb315d0adf04230f9a41c36064a1fc37
context_sha256: bf07c50c61a7baedd4b602ff6db3686ac2fed8143d8982cae3fe16a4eade3334
generated_at: 2026-11-22T02:17:20.617209+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/scaffold/templates-contract.ts

## Purpose
Generates the text of a scaffolded module's own `openapi.yaml` contract fragment. The fragment is shaped so the root assembler can complete it: paths and tags reach the root bundle on their own, and shared components are referenced from the root contract file.

## Key elements
- `openapiFragment(names, group)` (exported): returns the full OpenAPI 3.1.0 YAML string for a module. It covers:
  - **Tag:** one tag named after the entity, with an `x-family` taken from `TAG_FAMILY_OF_GROUP[group]` (falls back to `'Other'`).
  - **Collection path** (`names.basePath`): list (paginated, with a `sort` query param) and create (returns `201` with a `Location` header).
  - **Item path** (`names.basePath/{id}`): read, replace (`PUT`), update (`PATCH`, merge-patch, accepts `application/json` and `application/merge-patch+json`) and delete (`204`).
  - **Local schemas:** `<Plural>Response`, `<Entity>Sort`, `<Entity>`, `<Entity>Actions`, `Create<Entity>Request`, `Replace<Entity>Request` and `Update<Entity>Request`.
- `ROOT`: relative path to the shared root contract (`openapi.root.yaml` under `shared/contracts`), used in `$ref`s to shared parameters, headers, responses and schemas (`PageParam`, `PageSizeParam`, `IdPathParam`, `Location`, `NoContent`, `PaginationMeta`, `Id`).
- `errorResponse(status, component)`: builds one indented YAML line pointing at a shared response component.
- `KEYED_ERRORS`, `KEYED_ERRORS_WITH_NOT_FOUND` and `PATH_ONLY_ERRORS`: pre-joined error-response blocks spliced into each operation.

## Relationships
- `scripts/contracts/fragments.ts`: provides `TAG_FAMILY_OF_GROUP`, which maps the module's group to the tag's API-docs family.
- `scripts/scaffold/names.ts`: provides the `ModuleNames` type. Its fields (`kebab`, `entity`, `entityCamel`, `plural`, `words`, `basePath`) fill the template.
- `scripts/scaffold/plan.ts`: a graph neighbor. This file doesn't import it, so the link is presumably that the scaffold plan uses this generator to produce the module's contract fragment.

## Notes
- Every operation uses `bearerAuth` or `apiKeyAuth`.
- Error sets differ by route:
  - List and create: 401, 403, 422.
  - Read and delete, which take only a path id: 401, 403, 404, with no 422.
  - Replace and update: 401, 403, 404, 422.
- `PUT` requires `name`, and `notes` can be `null` or a string. `PATCH` makes every field optional (omitted means unchanged, `null` clears `notes`).
- Each entity includes a server-decided `actions` object (`update`, `delete` booleans) that clients use to render controls.
- The `sort` grammar is a JSON:API-style array (1–3 entries) limited to `createdAt`, `-createdAt`, `name` and `-name`. A template comment says it is the one sort grammar shared with every list.
- The YAML is hand-built with template literals and 4-space indentation. The error-response lines are hard-coded to 16 spaces, so they must stay aligned with the `responses:` blocks if the template is edited.
