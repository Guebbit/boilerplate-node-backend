---
source: tests/unit/scripts/setup/environment-file.test.ts
sha256: 347ea982d4a693fb756ff9b914fe546a717cef37986083e81557534aadf3d309
generated_at: 2026-11-08T10:42:55.388369+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/setup/environment-file.test.ts

## Purpose

Unit tests for the pure, in-memory text-level functions that power `npm run setup`'s environment-file handling. This file exercises string manipulation only (no filesystem I/O); the end-to-end `.env-example` flow is covered separately in `first-run.test.ts`.

## Key elements

- **`describe('fillPlaceholders')`** — Verifies that `fillPlaceholders` replaces only an exact `KEY=placeholder` line with a generated value, leaves already-set keys untouched, is idempotent on a second pass, ignores substring matches, and fills multiple keys independently in a single pass.
- **`describe('generateSecret')`** — Asserts the generated secret is ≥ 32 chars, contains neither `,` nor `:`, and differs across calls.
- **`describe('readEnvironmentValue')`** — Confirms the function returns the value for a present key, returns `undefined` for an absent key, and returns `undefined` (not the comment text) for a commented-out line (`#KEY=…`).

## Relationships

- **`scripts/setup/environment-file.ts`** — The module under test. This file imports `fillPlaceholders`, `generateSecret`, and `readEnvironmentValue` from it and asserts on their string-level behavior.

## Notes

- The placeholder match is an **exact whole-line** comparison (`KEY=placeholder`), not a substring search; a value like `change-me-but-longer` is intentionally left alone.
- The `fillPlaceholders` signature takes a `generateFn: (key: string) => string` callback rather than a fixed string, allowing per-key values.
- Because no filesystem is involved, these tests run fast and have no fixture setup/teardown; the integration counterpart (`first-run.test.ts`) owns real-file scenarios.
