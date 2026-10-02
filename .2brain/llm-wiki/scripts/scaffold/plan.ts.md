---
source: scripts/scaffold/plan.ts
sha256: f3118f600eb477bfd4b0559e2fd73b1ef0949adb54c4fbff7535d8da0bcde3ba
generated_at: 2026-10-01T12:39:32.455205+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/plan.ts

## Purpose

Computes, as pure data, the complete list of files (path + content) that scaffolding a module will create. Being pure means unit tests can assert the plan without touching the filesystem, and the CLI layer is reduced to the collision check, the actual writes, and any follow-up process calls.

## Key elements

- **`PlannedFile`** (interface) — a single file entry: repo-relative `path` (forward slashes) and unformatted `content`.
- **`ScaffoldPlan`** (interface) — the full plan: `names: ModuleNames` plus `files: PlannedFile[]`.
- **`runtimeFiles`** (private) — returns the 14 standard module files under `src/modules/<kebab>/` (manifest, barrel, model, repository, service, presenter, routes, factories, four HTTP controllers, module.yaml).
- **`declarationFiles`** (private) — returns `openapi.yaml`, `authorization.yaml`, and conditionally `audit.ts` (only when `options.audit` is set).
- **`testAndDocumentFiles`** (private) — returns three test files (`routes.test.ts`, `factories.test.ts`, `service.test.ts`) and the `docs/modules/<kebab>.md` page.
- **`planModule`** (exported) — derives names via `deriveNames`, then concatenates the three groups above into a `ScaffoldPlan`. This is the main entry point.
- **`collidingSchemas`** (exported) — given a set of already-declared schema names, returns the subset of the plan's schema names (entity, envelope, request/response variants) that would collide. Empty array means the plan is safe.

## Relationships

- **`scripts/scaffold/names.ts`** — imports `deriveNames` and the `ModuleNames` type to translate the raw option string into all spellings.
- **`scripts/scaffold/options.ts`** — imports the `ScaffoldOptions` type that parameterises every template call.
- **`scripts/scaffold/templates-code.ts`** — supplies all code-file template functions (controllers, service, repository, barrel, etc.).
- **`scripts/scaffold/templates-contract.ts`** — supplies `openapiFragment` for the contract file.
- **`scripts/scaffold/templates-documentation-tests.ts`** — supplies the test-file and docs-page template functions.
- **`scripts/scaffold/apply.ts`** — the CLI consumer that takes a `ScaffoldPlan`, runs the refusal check (`collidingSchemas`), formats content with Prettier, writes files, and invokes `registerModule`.
- **`tests/unit/scripts/scaffold/plan.test.ts`** — unit-tests the pure plan output.
- **`tests/unit/scripts/scaffold/apply.test.ts`** — exercises the write path that depends on the plan shape.

## Notes

- `content` is intentionally **unformatted**; Prettier is applied downstream in the CLI (`apply.ts`), not here.
- `planModule` deliberately excludes central-repo edits (e.g. `registerModule` registrations). Those are handled separately by the apply step.
- `audit.ts` is the only conditional file in the plan; all others are always present.
- `collidingSchemas` performs no I/O — it is a pure set-membership filter, so it can be called repeatedly in tests without mocking the filesystem.
