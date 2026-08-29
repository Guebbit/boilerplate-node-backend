# docs/api/openapi-workflow.md

## Purpose

Documents the OpenAPI contract workflow for this boilerplate: the rule that per-module YAML fragments (not the bundled `openapi.yaml`) are the single source of truth, and the exact sequence of bundle → lint → mock → codegen → implement → test steps that keeps backend, generated types, and frontend consumers in sync.

## Key elements

- **Workflow rule** — Always start by editing `src/modules/<name>/openapi/*.yaml`; never hand-edit `openapi.yaml`.
- **`npm run contracts:bundle`** — Assembles `openapi.yaml` (and six other bundles) from per-module fragments; overwrites any manual edits.
- **`npm run gen:api`** — Deletes `api/` and regenerates it via orval (Zod schemas + TS types). Destructive (`rm -rf`).
- **`npm run lint:openapi`** — Runs Spectral against `spectral.yaml` rules.
- **`npm run test:prism`** — Smoke-tests a Prism mock server against the spec.
- **Generated output (`api/`)** — `schemas.zod.ts` (one Zod schema per operation) and `models/` (TS types + `as const` enum objects). No HTTP client is generated.
- **`@types` alias** — The only sanctioned import path for generated types and enum consts.
- **`orval.config.ts`** — Controls codegen: input spec, output target/schemas/client/mode.
- **Ownership** — This repo owns the contract; the frontend holds a byte-identical copy and never edits it.
- **OpenAPI vs AsyncAPI** — OpenAPI for REST endpoints; AsyncAPI (`asyncapi.yaml`) for SSE/event-driven/queue contracts.

## Relationships

- **`docs/api/regenerating.md`** — The "I changed X, run Y" cheat sheet. This page points readers there for the full command sequence and failure-message explanations after any contract change.
- **`docs/api/index.md`** — Provides the API overview and the REST style conventions that the contract (and therefore this workflow) must follow. This page links to its `#rest-patterns-used-here` anchor as the authoritative style reference.

## Notes

- `npm run gen:api` is **destructive**: it runs `rm -rf ./api` before regenerating. Any local edits inside `api/` are lost.
- orval generates enums as `as const` objects, **not** TS `enum` declarations. The naming convention is `<SchemaName><PropertyName>` in PascalCase (e.g., `UpdateFeedbackRequestStatusRequestStatus`). Use `z.nativeEnum()` for Zod.
- `orval.config.ts` uses `output.mode: "single"` (one `schemas.zod.ts` for all operations). Switching to `tags-split` changes the generated file layout only — it does **not** split the spec itself.
- A test fails first if you edit a fragment and forget to re-bundle; the guard is intentional.
- This page explicitly scopes itself: document workflow and conventions here; individual request/response shapes belong in the spec, not in prose docs.
