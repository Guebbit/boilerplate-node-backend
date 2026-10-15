---
source: tests/unit/scripts/contracts/permission-actions-render.test.ts
sha256: 39577c384cc897ebdd527b9da38df7b145ea3decac24a26531cfcd4c78fbe59c
generated_at: 2026-10-15T13:26:13.093302+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/permission-actions-render.test.ts

## Purpose

Unit tests for the `readPermissionActions` and `renderPermissionActions` helpers, verifying that the parser correctly extracts a list of action names from a contract document and that the renderer emits a deterministic TypeScript snippet (const array + derived union type).

## Key elements

- **`describe('readPermissionActions')`** – Confirms the happy path (returns declared actions in order) and five rejection cases (missing `actions` key, empty array, non-string entry, duplicate entry, completely empty input). Each rejection asserts a thrown error matching `/actions/` (or `/no \`actions:\`/` for the empty-document case).
- **`describe('renderPermissionActions')`** – Calls `renderPermissionActions(['read', 'sweep'])` once, then asserts the output contains the expected `PERMISSION_ACTIONS` const and `PermissionAction` union type, and that a second call with the same input is byte-identical (determinism check).

## Relationships

- **`scripts/contracts/permission-actions-render.ts`** — the module under test; this file imports both `readPermissionActions` and `renderPermissionActions` from it.

## Notes

- Rejection cases are driven by `it.each` with a `%s` placeholder in the test title, keeping the failure output human-readable (e.g. "refuses a document whose `actions` is empty").
- The empty-document case (`''`) is tested separately from the `it.each` block because it expects a different error message (`/no \`actions:\`/`) than the other rejections.
- The determinism assertion compares full string equality (`toBe`) against a single captured `output` constant, so any non-deterministic whitespace or ordering change would be caught.
