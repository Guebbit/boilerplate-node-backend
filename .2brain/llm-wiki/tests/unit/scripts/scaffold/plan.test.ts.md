---
source: tests/unit/scripts/scaffold/plan.test.ts
sha256: 9e8d1e1f7b51fbb9055cc63b0ccdc05b5599dcf8e2181b17ab5ce2dd2c6a993c
generated_at: 2026-11-08T10:42:17.576751+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/plan.test.ts

## Purpose

Unit tests for the scaffold planner (`planModule`) and its schema-collision helper (`collidingSchemas`). Verifies the exact file list a new module produces, that generated YAML (descriptor, authorization, OpenAPI) parses and contains the expected declarations, that the `audit` toggle removes the right artifacts while preserving caller context, and that `regenerate` graph markers are emitted in the docs page.

## Key elements

- **`OPTIONS`** – A fixed `ScaffoldOptions` fixture (`name: 'field-notes'`, `group: 'foundation'`, `audit: true`, `regenerate: false`) reused across every test case.
- **`contentOf(options, file)`** – Helper that calls `planModule(options)` and returns the `content` string for a given file, matching by relative path (`services/crud.ts`) or full repo path (`src/modules/…`). Throws if the file is not in the plan.
- **`describe('planModule')`** – Asserts the complete 30-file list, that all paths stay within `src/modules/field-notes/` or the docs page, and that `audit: false` drops `audit.ts`, `rules.yaml`, `rules.generated.ts`, removes `recordAudit`/`AuditActions` from CRUD service code, yet keeps `CallerContext` and sets `noAudit:` in `module.yaml`.
- **`describe('the audit rules')`** – Parses `rules.yaml` and confirms each of the 4 listed audit actions also appears in the pre-rendered `rules.generated.ts`.
- **`describe('the generated module.yaml')`** – Round-trips the YAML through `moduleDescriptorSchema.parse` (validating against the strict Zod schema) for both audit and noAudit variants.
- **`describe('the generated declarations')`** – Validates `authorization.yaml` (one rule per CRUD action, single `FieldNoteManagement` set), `openapi.yaml` (6 operation IDs, `ReplaceFieldNoteRequest`/`UpdateFieldNoteRequest` schemas, required `actions` field, `FieldNoteActions.required` = `['update','delete']`), and the `<!-- module-graph:field-notes:start/end -->` markers in the docs page.
- **`describe('collidingSchemas')`** – Confirms that `collidingSchemas` returns only the names present in both the new module's schema list and the existing set, and returns `[]` for an empty set.

## Relationships

- **`scripts/scaffold/plan.ts`** – System under test. Provides `planModule` (returns `{ files, names }`) and `collidingSchemas`.
- **`scripts/scaffold/options.ts`** – Supplies the `ScaffoldOptions` type that shapes every fixture in this file.
- **`scripts/docs/module-descriptor.ts`** – Supplies `moduleDescriptorSchema` (Zod), used here as the validation target for generated `module.yaml`.

## Notes

- `contentOf` matches a file by **either** its relative path or its `src/modules/<name>/…` repo path; passing the wrong form will throw `not planned: …`.
- The audit-off test asserts that `CallerContext` still appears in `services/crud.ts` even when `audit` is `false` — the context parameter is kept so callers can still pass audit info; only the *recording* calls are stripped.
- The summary fixture deliberately contains a single-quote (`"It's a note."`) to exercise YAML quoting edge-cases in the generated descriptor.
- `regenerate` is hard-coded to `false` in `OPTIONS`; the graph-marker test only verifies that the markers are *present* in the output, not that `regenerate` controls them.
