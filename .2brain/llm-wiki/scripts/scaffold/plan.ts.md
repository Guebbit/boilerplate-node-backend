---
source: scripts/scaffold/plan.ts
source_sha256: fc62d29175843f50b1eec7a95532a287cb3876c4b2d36a26633fc6f7d5b6e346
context_sha256: adb47ae0a7f4bd3f0fa19d191dea7e1a350b7be858e857a010270ea3b0182a7c
generated_at: 2026-11-22T02:16:08.759996+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/scaffold/plan.ts

## Purpose
Describes, as pure data, which files scaffolding a new module writes: a list of `{ path, content }` entries. Because it never touches disk, a unit test can assert the plan directly, and the CLI is left with only the refusal check, the writes and the process calls.

## Key elements
- `PlannedFile` — one file to create: a repo-relative, forward-slash `path` and unformatted `content` (the CLI runs Prettier over it before writing).
- `ScaffoldPlan` — the result: the module's `names` (`ModuleNames`) plus the `files` list.
- `planModule(options)` — exported entry point. Calls `deriveNames(options.name, options.entity)` and concatenates the file groups below. It plans no central edits; those belong to `registerModule`.
- `runtimeFiles` (internal) — always planned, under `src/modules/<kebab>/`: `module.yaml`, `module.ts`, `index.ts`, `model.ts`, `repository.ts`, `presenter.ts`, `routes.ts`, `factories.ts`, `services/{index,crud,actions}.ts`, `domain/{index,rules}.ts`, and five controllers (list, get item, post, update, delete).
- `declarationFiles` (internal) — `openapi.yaml` and `authorization.yaml`, plus the audit files when `options.audit` is set.
- `auditFiles` (internal) — `rules.yaml`, `rules.schema.ts`, a generated rules file and `audit.ts`. The generated file is rendered immediately with `renderGenerated` so the module compiles before the first regenerate.
- `testAndDocumentFiles` (internal) — unit tests (routes, factories, domain), an integration service test, a contract test, and `docs/modules/<kebab>.md`.
- `collidingSchemas(names, taken)` — returns which of the module's OpenAPI schema names already exist in `taken`: the entity name, its actions and sort schemas, the plural response schema, and the create, replace and update request schemas. This lets a scaffold be refused before any file is written.

## Relationships
- `names.ts` — supplies `deriveNames` and the `ModuleNames` type used throughout.
- `options.ts` — supplies the `ScaffoldOptions` type (`name`, `entity`, `group`, `audit`).
- `templates-code.ts` — supplies the source and YAML content for runtime, audit and authorization files.
- `templates-contract.ts` — supplies `openapiFragment`.
- `templates-documentation-tests.ts` — supplies the test and documentation page content.
- `scripts/contracts/shared-rules-render.ts` — supplies `renderGenerated`, which produces the generated rules file.
- `apply.ts` — the consumer that performs the writes (and the refusal check) from this plan; covered by `apply.test.ts`.
- `plan.test.ts` — unit test asserting the plan.

## Notes
- Audit files are optional; everything else is planned unconditionally.
- `collidingSchemas` only checks names; it does not read the repo itself, so the caller must supply the `taken` set.
