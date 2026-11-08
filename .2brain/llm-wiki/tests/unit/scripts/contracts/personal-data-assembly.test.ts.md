---
source: tests/unit/scripts/contracts/personal-data-assembly.test.ts
sha256: e582d67f5dd6ec319250bd0d7719484b55b515f74c9b6820f6aabd56e10bf1f9
generated_at: 2026-11-08T10:34:24.033073+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/personal-data-assembly.test.ts

## Purpose

Unit tests for the personal-data assembly contract. Verifies that `assemblePersonalData` correctly merges declared module sections into the owner's `AccountExportResponse` stub, that `readPersonalDataSections` discovers and normalises section declarations from a module tree, and that `stageExportSchema` rewrites the owner file in-place — including edge cases like duplicate keys, missing owners, and absent modules.

## Key elements

- **`OWNER`** – A minimal OpenAPI 3.1 YAML stub containing a single `AccountExportResponse` schema with one required `exportedAt` property. Serves as the base document in every assembly test.
- **`section(over?)`** – Factory returning a `PersonalDataSection` with sensible defaults (`module: 'widgets'`, `required: true`, an array schema). Spread a partial override to vary a single field.
- **`stubOf(text)`** – Parses a YAML string and extracts `.components.schemas.AccountExportResponse` with a typed shape, used to assert on the assembled result.
- **`describe('assemblePersonalData')`** – Five cases: property + `required` addition, optional section excluded from `required`, empty-section no-op, duplicate-key rejection (error names the second module), and rejection when the owner declares no `AccountExportResponse`.
- **`describe('readPersonalDataSections and stageExportSchema')`** – Filesystem-backed tests that create a temp tree (`account/`, `widgets/`) per case:
  - Reads sections in module order; `required` defaults to `true` when omitted.
  - Rewrites in-file `$ref`s to absolute module-relative paths (`../widgets/openapi.yaml#/…`) while leaving cross-file refs (`../../../shared/…`) untouched.
  - `stageExportSchema` writes the merged stub back into the owner file within the target tree.
  - No-throw when the owner directory is absent.

## Relationships

- **`scripts/contracts/personal-data-assembly.ts`** (sole production dependency) – Provides `assemblePersonalData`, `readPersonalDataSections`, `stageExportSchema`, and the `PersonalDataSection` type. Every assertion in this file exercises one of those exports.
- **`yaml`** – Used via `parse` in `stubOf` to turn the assembled YAML text back into a JS object for structural assertions.
- **`node:fs` / `node:os` / `node:path`** – The second `describe` block creates a real temp directory (`mkdtempSync`) with `openapi.yaml` files per module, then tears it down in `afterEach`.

## Notes

- The second `describe` block performs real filesystem I/O in `os.tmpdir()`. If tests are run in a restricted environment (no write access to the temp dir) they will fail.
- `stageExportSchema(root, root, modules)` is called with the *same* path for source and target; the test confirms it mutates the owner file in that tree. A different target path is not covered here.
- The duplicate-key error message is matched with a regex that includes the second module name (`gadgets`), so the production error string must name both the key and the conflicting module.
- `readPersonalDataSections` is called with `['widgets', 'missing']` in one test to confirm a non-existent module directory is silently skipped rather than throwing.
