---
source: tests/cross-cutting/contract-aliases.test.ts
sha256: 290a01000b938973b008bed06b6205a07c71fc19963b4d4c3f62d9a6812b1b81
generated_at: 2026-10-29T06:44:10.994533+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-aliases.test.ts

## Purpose

Validates the `x-alias-of` extension in `openapi.yaml`. When two operations express the same intent in different spellings (e.g. `DELETE /users/{id}` vs `DELETE /users/{id}/hard`), this test enforces that the annotation is honest: the alias must point at a real, non-alias, non-self operation whose success status code and response schema are identical. It exists so SDK authors can safely treat an alias as interchangeable with its canonical form.

## Key elements

- **`operations`** – Flat array of every HTTP operation in the spec, each tagged with its route, method, and operation object.
- **`byOperationId`** – Map from `operationId` → operation entry, used to resolve the target of an `x-alias-of` reference.
- **`aliases`** – Subset of operations that carry the `x-alias-of` extension.
- **`successSchema(operation)`** – Serialises the `application/json` schema of the first 2xx response (ignoring prose descriptions) into a comparable JSON string.
- **`successStatus(operation)`** – Returns the first 2xx status code string (e.g. `"200"`, `"201"`).
- **`describe('operation aliases')`** block containing six assertions:
  - Spec parsed correctly (sanity tripwire: >50 operations, >3 aliases).
  - Every `x-alias-of` target exists in `byOperationId`.
  - No alias points at another alias (no chains).
  - No alias references itself.
  - Alias and canonical share the same success status code.
  - Alias and canonical share the same success response schema.

## Relationships

No graph neighbors are recorded for this file. It is a leaf test that reads `openapi.yaml` directly via `node:fs` and has no project-internal imports.

## Notes

- **Why `x-alias-of` instead of `deprecated: true`?** The spec intentionally keeps both spellings; `deprecated` would cause code generators (orval) to emit warnings in the frontend. The `x-` extension is ignored by all generators and carries zero runtime cost.
- **Schema comparison is structural, not textual.** `successSchema` compares only the JSON schema object, deliberately excluding human-readable `description` strings that legitimately differ between the two spellings.
- **Status codes are compared separately from schemas.** A 201-vs-200 mismatch breaks a caller's branching logic even if the body schema is identical, so it gets its own assertion.
- **The tripwire test** (`expect(operations.length).toBeGreaterThan(50)`) guards against a mis-parsed or wrong-path YAML making every other assertion pass vacuously.
