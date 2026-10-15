---
source: tests/unit/scripts/contracts/personal-data-assembly.test.ts
sha256: e582d67f5dd6ec319250bd0d7719484b55b515f74c9b6820f6aabd56e10bf1f9
generated_at: 2026-10-15T13:26:23.673017+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/personal-data-assembly.test.ts

## Purpose

Unit tests for the `personal-data-assembly` contract: verifies that declared personal-data sections are correctly merged into an owner OpenAPI stub, that sections are read from module directories on disk, and that a staged copy of the export schema is written back without touching unrelated files.

## Key elements

- **`OWNER`** (const) – Minimal OpenAPI 3.1.0 stub containing only the `AccountExportResponse` schema; serves as the base document in every `assemblePersonalData` call.
- **`section(over?)`** (helper) – Builds a `PersonalDataSection` object with sensible defaults (`module: 'widgets'`, `required: true`, array schema with a cross-file `$ref`); spread-override pattern for per-test variations.
- **`stubOf(text)`** (helper) – Parses a YAML string and extracts `components.schemas.AccountExportResponse` with a typed shape, used for assertions.
- **`describe('assemblePersonalData')`** – Five tests covering: required vs. optional sections appearing in `properties`/`required`, no-op when no sections are declared, duplicate-key rejection (two modules claiming the same key), and rejection when the owner has no `AccountExportResponse` stub.
- **`describe('readPersonalDataSections and stageExportSchema')`** – Filesystem-backed tests using a real temp directory (`mkdtempSync`). Covers: reading sections in module order with `required` defaulting to `true`; rewriting in-file `$ref`s to the declaring module while preserving cross-file refs; writing the assembled stub back into a staged copy; and graceful no-op when the owner directory is absent.

## Relationships

- **`scripts/contracts/personal-data-assembly.ts`** – The sole production import. The test exercises all four public exports (`assemblePersonalData`, `readPersonalDataSections`, `stageExportSchema`, and the `PersonalDataSection` type) from that module.

## Notes

- Tests use **real filesystem I/O** (temp dir under `os.tmpdir()`, cleaned up in `afterEach`) rather than mocked `fs`, so they exercise the actual `path.join` logic in `readPersonalDataSections` / `stageExportSchema`.
- The `section()` helper's default `$ref` (`'../widgets/openapi.yaml#/…'`) is deliberately a *cross-file* reference; the in-file-rewrite test relies on the fixture in the temp dir using a *relative* ref (`'#/'…`) to distinguish the two cases.
- `stubOf` casts the parsed YAML to a narrow shape; if `AccountExportResponse` is absent the cast still succeeds at runtime (returns `undefined`), which is why the "refuses an owner with no stub" test expects a throw from the production code rather than a parse error.
