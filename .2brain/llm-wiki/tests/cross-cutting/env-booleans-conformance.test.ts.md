---
source: tests/cross-cutting/env-booleans-conformance.test.ts
sha256: dd0f4885d60594c4b2ad1c71ad0febd9cc39a8973fe2a6b97265039eebcf676f
generated_at: 2026-11-08T09:26:48.518522+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/env-booleans-conformance.test.ts

## Purpose

Conformance test that verifies the TypeScript `parseBooleanWord` function produces identical results to its PHP counterpart. It executes a shared set of boolean-word cases (defined in `shared/cases/env-booleans.cases.yaml`) against the TS implementation, ensuring cross-language consistency.

## Key elements

- **`wordCase`** — Zod schema extending `caseBase` with two fields: `word` (the input string) and `expect` (`true`, `false`, or the literal `'invalid'`). Validates the shape of each YAML case row.
- **`describeCases('env-booleans', wordCase, …)`** — Loads the shared YAML cases, iterates each one, and asserts that `parseBooleanWord(one.word) ?? 'invalid'` equals `one.expect`. The nullish-coalescing maps a `null`/`undefined` return (non-boolean word) to the string `'invalid'`.

## Relationships

- **`src/infrastructure/config/fields.ts`** — Source of `parseBooleanWord`, the function under test.
- **`tests/support/cases.ts`** — Provides `caseBase` (the Zod base schema for shared case rows) and `describeCases` (the runner that loads YAML files and drives per-case assertions).

## Notes

- The `?? 'invalid'` coercion is the only translation between the function's `boolean | null | undefined` return and the three-valued `expect` field; it assumes `parseBooleanWord` never returns `null` for valid booleans.
- The file is explicitly a **cross-cutting conformance** test (hence the directory name); its correctness depends on the YAML case file staying in sync with the PHP twin's expected outputs.
- No mocking or setup is needed — `parseBooleanWord` is treated as a pure function.
