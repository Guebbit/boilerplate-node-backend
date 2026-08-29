# docs/reference/contracts.md

## Purpose

Single reference page for the contract pipeline: how `openapi.yaml` and `asyncapi.yaml` are bundled from a root preamble plus per-module fragments, what downstream artifacts are generated (Zod schemas, TS types, client collections), and which Spectral ruleset applies at each stage. Read this instead of tracing the bundling and codegen commands yourself.

## Key elements

- **Bundling pipeline** — `npm run contracts:bundle` merges `openapi.root.yaml` + per-module REST fragments into `openapi.yaml`, and `asyncapi.root.yaml` + per-module async fragments + `asyncapi.workers.yaml` into `asyncapi.yaml` and `asyncapi.public.yaml`.
- **Mermaid flowchart** — visual of the full source → bundle → generated-artifact graph.
- **Sources table** — `openapi.root.yaml`, `asyncapi.root.yaml`, `asyncapi.workers.yaml`, `analytics.frontend.ts`: the only hand-edited contract files.
- **Bundled documents table** — `openapi.yaml`, `asyncapi.yaml`, `asyncapi.public.yaml`: all generated, all byte-identity-checked.
- **Generated code table** — `api/schemas.zod.ts` (Zod validators via `npm run gen:api`) and `api/models/*.ts` (TS interfaces, rewritten wholesale by Orval).
- **Spectral rulesets table** — `spectral.yaml` (whole OpenAPI doc), `spectral.modules.yaml` (REST fragments), `spectral.asyncapi.modules.yaml` (async fragments + workers doc).
- **Client collections table** — Postman, Insomnia, Bruno, and Mockoon exports derived from `openapi.yaml`.

## Relationships

- **`openapi.yaml`** — Documented here as a *generated* artifact of the bundle step; it is the input to Orval (`npm run gen:api`), Prism, the contract test suites, and all four client collections.
- **`asyncapi.yaml`** — Documented here as a *generated* artifact; it is the source for `src/types/asyncapi.generated.ts` via `npm run gen:asyncapi`.
- **`docs/reference/index.md`** — This page is listed as a child entry in the reference index.

## Notes

- **Never hand-edit generated files.** `npm run check:contracts-bundle`, `check:asyncapi-types`, and `check:spec-identity` each fail CI if a committed copy diverges from a fresh bundle/codegen run.
- **Three Spectral rulesets exist** because fragments lack `info` and `servers` blocks; a single whole-document ruleset would reject every valid fragment.
- **`api/models/*.ts` is excluded from the project glossary by house rule** (hundreds of files, wholesale-rewritten). Import through the `@types` barrel, never by relative path.
- Per-module contract fragments are catalogued in `./src-modules.md`, not here.
