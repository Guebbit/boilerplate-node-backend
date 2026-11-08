---
source: scripts/contracts/asyncapi-breaking.ts
sha256: bb4e44189c53e98e1aa033d975e5f42928bbb7662ccd83de867619bb98ce3891
generated_at: 2026-11-08T02:38:14.890814+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/asyncapi-breaking.ts

## Purpose

Holds the pure classification logic for detecting breaking changes between two AsyncAPI documents. It is extracted from the CLI entry point so that unit tests can import the function directly without triggering the git workflow or `process.exit` side-effects.

## Key elements

- **`breakingChanges(before, after, acknowledged?)`** (exported) — Compares two dereferenced AsyncAPI documents via `@asyncapi/diff`, keeps only breaking changes, and filters out any whose JSON pointer matches an entry in the acknowledged list. Returns a `DiffOutputItem[]` (empty array when nothing breaks).
- **`OVERRIDES`** (module-local) — Tells `@asyncapi/diff` to treat add/remove/edit on `/info/version` as non-breaking, preventing version-bump noise.
- **`AcknowledgedBreak`** (exported interface) — A `{ path, reason }` pair describing a deliberate, reviewed break. `path` is the JSON pointer the diff reports; `reason` documents who is affected and what they do.
- **`ACKNOWLEDGED_BREAKS`** (module-local, `readonly`) — Current list of acknowledged breaks (currently two US-spelling renames: `webhookOrderCancelled → webhookOrderCanceled` and `order.cancelled → order.canceled`). Entries should be deleted once the change lands on `origin/main`.

## Relationships

- **`scripts/contracts/check-asyncapi-breaking.ts`** — The CLI entry point. It imports `breakingChanges` (and the `AcknowledgedBreak` type) and wraps it with git-diff orchestration, console output, and a non-zero exit code. This file is the only place that performs the actual diff/classification.
- **`tests/unit/scripts/contracts/asyncapi-breaking.test.ts`** — Unit tests that import `breakingChanges` directly, passing custom `acknowledged` arrays to verify filtering behavior without invoking the CLI.

## Notes

- The `@asyncapi/diff` API is slightly inconsistent: the README documents the option as `overrides` (plural), but the code reads `override` (singular). This file uses the correct singular form.
- `diff().breaking()` returns a union of output formats; this file casts the result after an `Array.isArray` guard to get `DiffOutputItem[]`.
- The `acknowledged` parameter defaults to the module-level `ACKNOWLEDGED_BREAKS`, so callers can override it (as tests do) without mutating the shared list.
- Entries in `ACKNOWLEDGED_BREAKS` are intentionally scoped to a single JSON pointer. They are meant to be temporary—remove them once the change is merged to `origin/main`, which is the comparison base by default.
