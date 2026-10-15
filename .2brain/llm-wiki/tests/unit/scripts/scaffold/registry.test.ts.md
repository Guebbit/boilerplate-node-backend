---
source: tests/unit/scripts/scaffold/registry.test.ts
sha256: 827e9c47a5f132e7c6fc36de2911eeb5ccc3aa0ec07159efabc9672a6f107185
generated_at: 2026-10-15T13:31:54.373085+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/registry.test.ts

## Purpose

Unit tests for the scaffold registry editor, verifying that `registerModule` correctly inserts a new module's entry into all three alphabetical lists (import lines, `enabledModules` array, and `ModuleName` union) in `src/modules.ts`, and that `isRegistered` accurately reports whether a module is already present.

## Key elements

- **`REGISTRY`** — A string fixture mirroring the real `src/modules.ts` structure: three import lines, an `enabledModules` array, a function body after the array, and a `ModuleName` union type. Used as the shared input for all tests.
- **`describe('registerModule')`** — Four test cases covering:
  - Mid-list insertion (new entry sorts between existing ones).
  - End-of-list insertion where the line terminator (bare identifier vs. trailing `;`) must move to the new last line, while code following the array remains untouched.
  - Start-of-list insertion confirming imports sort by folder name and the array by identifier.
  - Error path: throws when the file lacks an `export type ModuleName` union.
- **`describe('isRegistered')`** — Verifies true/false results by reading import lines.

## Relationships

- **`scripts/scaffold/registry.ts`** — Source under test. Provides `registerModule` (performs the three-list insertion) and `isRegistered` (checks import lines for an existing module).
- **`scripts/scaffold/names.ts`** — Provides `deriveNames`, which converts a folder name (e.g. `'field-notes'`) into the identifier and other naming forms passed into `registerModule`.

## Notes

- The tests assert on multi-line string slices (e.g. `"feedback,\n    fieldNotes,\n    wishlist\n];"`) rather than the whole file, so they are sensitive to exact whitespace and line-terminator placement. When modifying `registerModule`, ensure both the "middle insert" and "end insert" terminator cases still produce these exact substrings.
- The `zebras` test deliberately checks that `enabledModules\n        .map` still appears in the output, guarding against the insertion logic consuming code that follows the array literal.
- The `api-keys` test encodes two different sort keys: imports are ordered by folder path, the array by camelCase identifier. Both happen to agree here, but the test comments call this out explicitly.
