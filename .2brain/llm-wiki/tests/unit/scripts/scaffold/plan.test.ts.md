---
source: tests/unit/scripts/scaffold/plan.test.ts
sha256: 3cbb003b0d2556a78e43162aaca39d22e1d7636b910026a44ec7803e660668ae
generated_at: 2026-10-15T13:31:46.099234+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/plan.test.ts

## Purpose

Unit tests for the scaffold planner (`planModule`) and its schema-collision helper (`collidingSchemas`). Verifies the exact file list a module scaffold emits, that generated YAML round-trips through the descriptor schema, that the `audit` flag correctly toggles file presence and inline code, and that authorization keys and OpenAPI operations follow the expected naming conventions.

## Key elements

- **`OPTIONS`** – a fixed `ScaffoldOptions` fixture (`name: 'field-notes'`, `group: 'foundation'`, `audit: true`) reused across most tests.
- **`contentOf(options, file)`** – test helper that calls `planModule` and returns the `.content` of the matching planned file. Accepts a path relative to the module folder *or* a full repo path; throws if the file was not planned.
- **`describe('planModule')`** – asserts the 20-file output list, that every path stays under `src/modules/field-notes/` or `docs/modules/field-notes.md`, and that setting `audit: false` removes `audit.ts`, strips audit symbols from `service.ts`/controllers, and adds `noAudit:` to `module.yaml`.
- **`describe('the generated module.yaml')`** – pipes the generated YAML through `yaml.parse` + `moduleDescriptorSchema.parse` to confirm it is schema-valid, including a summary containing an apostrophe.
- **`describe('the generated declarations')`** – checks `authorization.yaml` key naming (`fieldnotes.any.*`), OpenAPI `operationId`s (list/create/replace/update/delete) and component schemas (`Replace…Request`, `Update…Request`), and the presence of `docs:graph` HTML comment markers in the docs page.
- **`describe('collidingSchemas')`** – verifies that `collidingSchemas` filters a candidate set down to only the names already declared by the module.

## Relationships

- **`scripts/scaffold/plan.ts`** – provides `planModule` and `collidingSchemas`, the two units under test.
- **`scripts/scaffold/options.ts`** – exports the `ScaffoldOptions` type that shapes the `OPTIONS` fixture and the `contentOf` helper signature.
- **`scripts/docs/module-descriptor.ts`** – exports `moduleDescriptorSchema` (a Zod schema) used to validate the generated `module.yaml` output.

## Notes

- `contentOf` resolves a file by checking both `candidate.path === file` and `candidate.path === 'src/modules/{name}/{file}'`, so tests can pass either a bare filename (`service.ts`) or the full path.
- The apostrophe in the summary (`"It's a note."`) is deliberate: it exercises YAML quoting in the generated descriptor.
- The audit test asserts *both* the positive (`audit: true` → `noAudit` absent) and negative (`audit: false` → `noAudit:` present) cases within the same `it` block.
