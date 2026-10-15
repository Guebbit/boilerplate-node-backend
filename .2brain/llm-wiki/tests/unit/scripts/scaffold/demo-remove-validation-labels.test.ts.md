---
source: tests/unit/scripts/scaffold/demo-remove-validation-labels.test.ts
sha256: 9ebc8a3034d58e2419dbc4adcbd5c319d2832116aa07e4f15719c6cdd58cc687
generated_at: 2026-10-15T13:31:18.542855+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/demo-remove-validation-labels.test.ts

## Purpose

Unit tests for the scaffold script `demo-remove-validation-labels`. The file proves that `readRemovedFields` correctly identifies fields that *only* a removed module's OpenAPI contract names (resolving `$ref`s in surviving contracts), and that `stripValidationLabels` removes exactly those fields' labels from every locale dictionary while leaving all other JSON content untouched.

## Key elements

- **`write(relative, content)`** – Helper that creates a file under the per-test temp root, making parent directories as needed.
- **`labelsOf(locale)`** – Reads a locale JSON from the temp root and returns the keys of `validation.attributes`.
- **`dictionary(word)`** – Builds a locale JSON string whose `validation.attributes` labels every fixture field with a language-specific prefix (`"The …"` vs `"Il …"`).
- **`SURVIVOR`** – OpenAPI YAML for a surviving `/account` module. Exercises a `$ref` to `Address.city`, a query parameter (`page`), a multipart body (`imageUpload`), and a response property (`total`).
- **`REMOVED`** – OpenAPI YAML for the removed `/cart` module. Names all six fields inline.
- **`beforeEach` / `afterEach`** – Create a unique `mkdtempSync` directory, write both contracts and two locale files, then `rmSync` it on teardown.
- **`describe('readRemovedFields')`** – Asserts the result is `['imageUpload', 'quantity', 'total']`, i.e. fields absent from every surviving request body / query parameter.
- **`describe('stripValidationLabels')`** – Two cases: (1) removes the named labels from both dictionaries, preserves `generic.ok`, and returns one note per modified file; (2) no-op when no label matches a removed field.

## Relationships

- **`scripts/scaffold/demo-remove-validation-labels.ts`** – The module under test. This file imports `readRemovedFields` and `stripValidationLabels` from it and exercises both against a realistic multi-module, multi-locale filesystem layout.

## Notes

- Tests are **filesystem-based**: each case operates on a real temp directory (`mkdtempSync`), not an in-memory mock. Cleanup is `rmSync(root, { recursive: true, force: true })`.
- `SURVIVOR` deliberately includes a `$ref` (`#/components/schemas/Address`) so the test confirms the script resolves references when deciding whether a field is still in use.
- The assertions use `.toSorted()` (immutable) rather than in-place `.sort()`, so the expectation arrays are not mutated.
- `stripValidationLabels` is expected to return an array of note objects (each carrying a `.file` path) when it writes, and an empty array when it does not.
