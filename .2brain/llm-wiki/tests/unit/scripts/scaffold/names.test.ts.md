---
source: tests/unit/scripts/scaffold/names.test.ts
sha256: d9f83a87f63fd2fee72359e3b5cd97e7bb599904621acb6b6ba5d706ab1312f5
generated_at: 2026-11-08T10:41:56.258244+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/names.test.ts

## Purpose

Unit tests for the name-derivation and validation helpers in `scripts/scaffold/names.ts`. Because every scaffold template reads the derived spellings, a single casing error here would propagate into every generated file. These tests pin the accepted/rejected name grammars, the shape of the derived object, and the permission-string output.

## Key elements

- **`isValidModuleName`** — verifies that only lowercase kebab-case strings (letters and single hyphens, no digits, no leading/trailing hyphens) pass.
- **`isValidEntityName`** — verifies that entity names are strict PascalCase letters (no digits, no hyphens, no lowercase).
- **`deriveNames`** — checks the full mapping from a hyphenated plural module name to every derived spelling (kebab, identifier, entity, singular/plural forms, base path, words). Includes cases for naive singularisation and the `--entity` override.
- **`permissionRules`** — asserts the four action-prefixed permission strings (`read:Entity`, `create:Entity`, etc.) produced from a names object.
- **`permissionSetName`** — asserts the bundled-set name format (`EntityManagement`).

## Relationships

- **`scripts/scaffold/names.ts`** — the sole dependency. This test file imports `deriveNames`, `isValidEntityName`, `isValidModuleName`, `permissionRules`, and `permissionSetName` from that module and asserts their outputs. It is the only direct test coverage for that module.

## Notes

- The naive singulariser intentionally produces imperfect results (e.g. `boxes → Boxe`); the `--entity` flag is the documented escape hatch. Tests encode this "known imperfection" rather than demanding perfect English morphology.
- A dedicated test guards against the record type and its collection type sharing the same name (e.g. `catalog → Catalog / Catalogs`), which would cause a TypeScript collision in generated code.
- Module names reject digits specifically because the downstream permission-key grammar permits only letters and dots.
- The test file uses `it.each` for the invalid-name battery; when adding new rejection cases, extend the array rather than adding a separate `it` block.
