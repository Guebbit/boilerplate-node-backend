---
source: tests/cross-cutting/permission-conditions-stay-null-free.test.ts
sha256: 3c63fc53eaf52e99c71a8f05e71ec25dfc8f2e94daf860a7c9936f7470dda9aa
generated_at: 2026-11-14T23:05:43.769041+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/permission-conditions-stay-null-free.test.ts

## Purpose

Cross-cutting guard that inspects every condition value inside `PERMISSION_RULES` and asserts two invariants before they can leak onto the wire: the only permitted `null` is a top-level `deletedAt`, and no `$exists`-style operator key may appear at any nesting depth. It exists so that a rule accidentally introducing a new null or a Mongo-existence operator is caught at the permission-definition level rather than surfacing in a session answer.

## Key elements

- **`entriesDeep(value, path?)`** — Recursive helper that walks a (potentially nested) object and returns a flat `[dotPath, leafValue][]` list. Non-object and `null` values yield no entries.
- **`conditions`** (computed once per suite) — `PERMISSION_RULES` flattened via `entriesDeep` into `{ id, path, value }` tuples for every rule.
- **Canary test** — Asserts `conditions.length > 0` so the two substantive checks cannot pass vacuously.
- **"holds a null only as the top-level deletedAt"** — Filters for entries whose value is `null` and whose path is not exactly `deletedAt`; expects none.
- **"$exists-style operator" test** — Filters for any path whose last segment matches `$exists` (regex `(?:^|\.)\$exists$`); expects none.

## Relationships

- **`src/kernel/permissions.ts`** — Imports `PERMISSION_RULES`, the single source of truth for every permission rule's `id` and `conditions` object. This test is the downstream consumer that validates the shape of that data without exercising any runtime path.

## Notes

- The canary test is intentional: if `PERMISSION_RULES` were ever empty or every rule had `conditions: undefined`, the null and `$exists` assertions would trivially pass. The canary fails in that scenario.
- `entriesDeep` skips `null` leaves (returns `[]`), so a *top-level* `null` in a condition object is only visible through the parent's `Object.entries` entry—consistent with the check that only `deletedAt` may hold it.
- The `$exists` regex is anchored to the final path segment (`(?:^|\.)\$exists$`), so a key like `foo$exists` would **not** be flagged; only a key that is exactly `$exists` is.
