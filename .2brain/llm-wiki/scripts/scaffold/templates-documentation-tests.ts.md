---
source: scripts/scaffold/templates-documentation-tests.ts
sha256: 625800ca5e67fd1d9e8644f3782819067f30ca25fb357720ceaa46bf8fe11097
generated_at: 2026-10-29T01:44:42.794834+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/templates-documentation-tests.ts

## Purpose

Provides the string templates that the module scaffolder emits as a new module's documentation page and its companion test suite (unit, integration, and contract). Each export is a pure function that interpolates `ModuleNames` (and optionally `ScaffoldOptions`) into a template literal, so the scaffolder can write complete, runnable files without any runtime code generation.

## Key elements

- **`documentationPage(names, options)`** — Returns the Markdown wiki page for `docs/modules/<kebab>.md`. Includes a "tip" summary block (uses `options.summary`), graph-regeneration markers (`module-graph:<kebab>:start/end`), a permissions block, a narrative "story" section, and a Mermaid pipeline diagram (conditionally adds an audit-note via `options.audit`).
- **`routesTest(names)`** — Returns a Jest test asserting the CRUD route table: exact endpoint list and order, every route sits below the identity gate and carries `requirePermissionGuard`, and the list endpoint is never Redis-cached.
- **`factoriesTest(names)`** — Returns a Jest test for `make<Entity>`: defaults are applied, overrides win, and absent optional fields remain absent.
- **`domainTest(names)`** — Returns a Jest test for `<entityCamel>ActionsFor`, verifying it echoes back exactly the permission keys the caller holds.
- **`serviceTest(names)`** — Returns a Jest integration test (real DB via `setupTestDb`) covering create-trim, list, read, merge-vs-null update, 404 semantics, and delete.
- **`contractTest(names)`** — Returns a Jest contract test that exercises each HTTP route end-to-end (status codes, headers, body shape) against `openapi.yaml`; deliberately omits bare 401/403 cases (delegated to the shared authorization sweep).

## Relationships

- **`scripts/scaffold/names.ts`** — Consumes the `ModuleNames` type (provides `kebab`, `entity`, `entityCamel`, `basePath` spellings) used by every template for interpolation.
- **`scripts/scaffold/options.ts`** — Consumes the `ScaffoldOptions` type; only `documentationPage` reads from it (`summary`, `audit`), while the test templates depend solely on names.

## Notes

- All exports are **pure string builders**—no side effects, no file I/O. The calling scaffolder (in `plan.ts`) is responsible for writing the returned text to disk.
- Module docstring states a hard convention: *no backticks in generated comments*. Template literals use `\`` escapes where the generated code itself contains backticks (e.g., the contract test's error-message template literal).
- The docs page intentionally leaves several `TODO` sections ("Breaks if you change", "The story") for the human author to fill in post-scaffold.
- The Mermaid diagram in `documentationPage` is the only place `options.audit` is read; if audit is off the service node simply omits the annotation.
- Test templates assume a fixed CRUD surface (`GET /`, `GET /:id`, `POST /`, `PUT /:id`, `PATCH /:id`, `DELETE /:id`). Scaffolding a non-CRUD module would require editing the generated test, not the template.
