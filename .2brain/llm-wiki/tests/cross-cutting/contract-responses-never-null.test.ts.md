---
source: tests/cross-cutting/contract-responses-never-null.test.ts
sha256: e1ad0413bbe8f694d13c968f0d27a7632abf5d434f2dfdd67ab55cc8fda15c42
generated_at: 2026-10-29T06:44:49.315053+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-responses-never-null.test.ts

## Purpose

Guarantees that no response schema in the bundled API contract admits `null` as a valid type. This enforces the read-side of the empty-value rule: a response signals "no value" by omitting the key entirely, while `null` is reserved as a write verb (PUT/PATCH "clear this" semantics).

## Key elements

- **`Node`** (type alias) — union of `Record<string, unknown> | unknown[] | scalar | null | undefined`; the unit the walker steps through.
- **`resolveRef(root, ref)`** — resolves a `#/…` JSON-pointer `$ref` within the same document. Handles `~0`/`~1` unescaping.
- **`admitsNull(node)`** — returns `true` if the node's `type` field is `'null'` or a list containing `'null'`.
- **`nullableSchemas(root, node, at, seen)`** — recursively collects path strings for every sub-node that admits `null`; follows `$ref`s (tracked in `seen` to avoid cycles and duplicate work).
- **`nullableInResponses()`** — top-level entry: calls `readSpec()`, iterates every `paths → method → responses`, and returns the combined list of nullable locations.
- **`describe('contract responses never carry null')`** — two assertions:
  1. `nullableInResponses()` must be empty.
  2. A sanity check that the *same* walker **does** find `null` inside `UpdateInventoryLevelRequest` (a request schema), proving the walk is not trivially passing.

## Relationships

- **`tests/support/spec-walk.ts`** — provides `readSpec()`, which loads and returns the bundled OpenAPI/contract document. This is the sole import; all other logic is self-contained in this file.
- Referenced (not imported): `tests/support/response-contract.ts` handles free-form schemas (`additionalProperties: true`) where this test's structural walk cannot judge `null` usage.

## Notes

- The `seen` set is **shared** across all operations in `nullableInResponses`, so a `$ref` resolved once is not re-walked for a second operation — a deliberate dedup that also guards against self-referential schemas.
- `resolveRef` only handles the `#/…` form (same-document JSON pointer). External or fragment-URI refs are not supported and would throw.
- Free-form / `additionalProperties: true` schemas are explicitly **out of scope** here; they are covered by the separate `response-contract.ts` test.
- The second test case exists purely as a negative control: if the walker were broken (e.g., always returning `[]`), test 1 would pass vacuously but test 2 would fail.
