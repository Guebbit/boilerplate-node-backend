---
source: scripts/scaffold/plan.ts
sha256: fc62d29175843f50b1eec7a95532a287cb3876c4b2d36a26633fc6f7d5b6e346
generated_at: 2026-11-08T03:00:13.291326+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/plan.ts

## Purpose

Pure planning layer for the module scaffolder. Given parsed `ScaffoldOptions`, it computes the complete list of files (path + unformatted content) a new module needs, without performing any I/O. This separation lets unit tests assert the full plan against fixtures and keeps the CLI (`apply.ts`) responsible only for collision checks, Prettier formatting, and disk writes.

## Key elements

- **`PlannedFile`** (interface) — a single entry: repo-relative `path` (forward slashes) and unformatted `content`.
- **`ScaffoldPlan`** (interface) — the full output: derived `names` plus an array of `PlannedFile`.
- **`planModule(options)`** (export) — entry point. Calls `deriveNames`, then concatenates `runtimeFiles`, `declarationFiles`, and `testAndDocumentFiles` into the plan.
- **`collidingSchemas(names, taken)`** (export) — returns the subset of the plan's OpenAPI schema names (`User`, `UserActions`, `UserSort`, `UserResponse`, `CreateUserRequest`, `ReplaceUserRequest`, `UpdateUserRequest`) that already exist in `taken`, so the caller can refuse before writing.
- **`runtimeFiles`** (internal) — 18 source files under `src/modules/<kebab>/`: manifest, barrel, model, repository, presenter, services, domain, routes, factories, and five REST controllers.
- **`auditFiles`** (internal) — `rules.yaml`, `rules.schema.ts`, `rules.generated.ts` (rendered via `renderGenerated`), and `audit.ts`. Included only when `options.audit` is truthy.
- **`declarationFiles`** (internal) — `openapi.yaml`, `authorization.yaml`, and conditionally the audit set.
- **`testAndDocumentFiles`** (internal) — five test files under `tests/` (routes, factories, domain, service, contract) plus a `docs/modules/<kebab>.md` page.

## Relationships

- **`./names`** — calls `deriveNames` to turn the raw module name + entity into the `ModuleNames` spellings used in every path and template call.
- **`./options`** — consumes the `ScaffoldOptions` type (e.g. `options.group` for the OpenAPI tag, `options.audit` flag).
- **`../contracts/shared-rules-render`** — calls `renderGenerated` to produce `rules.generated.ts` from the audit vocabulary.
- **`./templates-code`** — supplies nearly all file-content builders (`moduleYaml`, `moduleManifest`, `barrel`, `modelFile`, `repositoryFile`, `presenterFile`, service/domain/route/factory files, controllers, `rulesYaml`, `rulesSchemaFile`, `auditFile`, `authorizationYaml`, `auditEntries`).
- **`./templates-contract`** — supplies `openapiFragment` for the module's OpenAPI file.
- **`./templates-documentation-tests`** — supplies all test-file and documentation-page content builders.
- **`./apply.ts`** — the consumer: takes the `ScaffoldPlan`, runs `collidingSchemas` as a guard, formats each file with Prettier, and writes to disk.
- **`tests/unit/scripts/scaffold/plan.test.ts`** — unit-tests `planModule` and `collidingSchemas` against expected file lists and name collisions.
- **`tests/unit/scripts/scaffold/apply.test.ts`** — exercises the apply step, which in turn exercises `planModule`.

## Notes

- Content in the plan is **unformatted**; `apply.ts` runs Prettier before writing. Tests should not expect formatted output.
- `collidingSchemas` checks seven specific schema names. If the template set grows, this list must be kept in sync.
- Audit files are **opt-in** via `options.audit`; the `rules.generated.ts` file is written at scaffold time so the module compiles before the first `regenerate` run.
- Paths always use forward slashes, even on Windows, matching the repo-relative path convention.
- The plan deliberately excludes "central edits" (e.g. `registerModule` calls in a top-level registry); those are handled elsewhere.
