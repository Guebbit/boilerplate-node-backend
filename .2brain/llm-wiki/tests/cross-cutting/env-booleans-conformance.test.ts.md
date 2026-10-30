---
source: tests/cross-cutting/env-booleans-conformance.test.ts
sha256: 8093e4f7415f1f7c58fcaabbc53b370fbfba172af9de32214ef156bd586616b2
generated_at: 2026-10-29T06:45:44.554636+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/env-booleans-conformance.test.ts

## Purpose

Conformance test that verifies the TypeScript `parseBooleanWord` function answers the same set of boolean-word cases as its PHP counterpart. Both implementations are driven by the same shared YAML case file (`shared/cases/env-booleans.cases.yaml`), making this a cross-implementation contract check rather than a unit test of internal logic.

## Key elements

- **`wordCase`** – Zod schema (extends `caseBase`) defining one test case: a `word` string and an `expect` value that is either a boolean or the literal `'invalid'`.
- **`describeCases('env-booleans', wordCase, 25, …)`** – Loads the 25 cases from the shared YAML file, validates each against `wordCase`, and asserts `parseBooleanWord(word) ?? 'invalid'` equals the expected value.

## Relationships

- **`src/infrastructure/config/fields.ts`** – Source of `parseBooleanWord`, the function under test.
- **`tests/support/cases.ts`** – Provides `caseBase` (shared Zod base for case schemas) and `describeCases` (helper that loads, validates, and iterates over a YAML case file).

## Notes

- The `?? 'invalid'` in the assertion maps a `null`/`undefined` return from `parseBooleanWord` to the `'invalid'` literal, so non-boolean words are treated as "not a boolean" rather than asserting falsiness.
- The case file is shared with the PHP suite; adding a case there changes expected behavior in both languages simultaneously.
- The test directory is `cross-cutting`, signalling it guards a cross-implementation contract rather than testing a single module's internals.
