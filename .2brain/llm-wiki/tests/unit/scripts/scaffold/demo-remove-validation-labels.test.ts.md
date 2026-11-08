---
source: tests/unit/scripts/scaffold/demo-remove-validation-labels.test.ts
sha256: 73fd177462b7e58425832e9f6fcbc2f39211a61c842cb7533c0de316b8520440
generated_at: 2026-11-08T10:41:47.926916+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/demo-remove-validation-labels.test.ts

## Purpose

Unit tests for the `demo-remove-validation-labels` scaffold script. It verifies that, given a repo with one "surviving" and one "removed" OpenAPI module plus locale dictionaries, the script correctly identifies fields that only the removed module uses and strips their validation labels from every dictionary while leaving unrelated content intact.

## Key elements

- **`readRemovedFields` test** — asserts that fields still referenced by a surviving JSON-body or query parameter (`email`, `city`, `page`) are *not* reported as removed, while fields exclusive to the removed module (`imageUpload`, `quantity`, `total`) are.
- **`stripValidationLabels` tests** — (1) confirms that labels for removed fields are deleted from every locale file, the rest of each file is byte-identical, and the return value lists the modified files; (2) confirms a no-op (empty array, file unchanged) when the passed field set matches nothing.
- **`SURVIVOR` / `REMOVED` constants** — inline OpenAPI YAML fixtures. The survivor exercises `$ref`, query params, multipart bodies, and response schemas; the removed module names all six fields plus uses them in a flat JSON body.
- **`dictionary(word)` helper** — produces a locale JSON file with a `generic.ok` key and `validation.attributes` entries for all six fields, using a per-locale prefix so the two files are distinguishable.
- **`beforeEach` / `afterEach`** — create a fresh temp directory (via `mkdtempSync`), write the fixture files, then recursively remove it after each test.

## Relationships

- **`scripts/scaffold/demo-remove-validation-labels.ts`** — the module under test; this file imports `readRemovedFields` and `stripValidationLabels` from it.
- **`tests/unit/infrastructure/http/validation-messages.test.ts`** — exercises the runtime path that *reads* the same `validation.attributes` dictionaries this test mutates; together they bracket the full read/write lifecycle of validation labels.
- **`tests/unit/scripts/pairing/spec-identity.test.ts`** — also works with per-module OpenAPI spec files; the two test files share the convention of building a throwaway repo root to simulate the on-disk layout the scaffold scripts expect.

## Notes

- The test relies on `toSorted()` (ES2023) on arrays for order-independent comparison; the project must target a Node/TS version that supports it.
- `readRemovedFields` intentionally excludes fields that appear only in **responses** or **multipart** request bodies of the surviving module—only JSON-body and query-parameter positions count as "still in use." The `SURVIVOR` fixture is crafted to make this distinction observable (e.g. `total` lives in a response, `imageUpload` in multipart).
- `stripValidationLabels` returns an array of `{ file }` notes; tests check both the side-effect (file on disk) and the return value, so a regression that silently skips a file would be caught by both assertions.
