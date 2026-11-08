---
source: tests/unit/scripts/testing/suites.test.ts
sha256: 17ae9879199e1b2b81a60e97eca1e12ddf63bb84a7a16481e05f78bf030aa8b1
generated_at: 2026-11-08T10:43:47.652740+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/testing/suites.test.ts

## Purpose
Unit tests for `isOutsideLightGate`, the helper the pre-commit hook uses to decide which staged test files it must run *on top of* the `complete:light` suite. The tests pin both directions of the gate: paths light skips must return `true`, and paths light already covers (or that aren't jest tests at all) must return `false`.

## Key elements
- **`describe('isOutsideLightGate')`** — single top-level suite; no nested describes.
- **Positive cases (`picks %s, a layer light leaves out`)** — parameterised list of integration, contract, and fuzz test paths expected to return `true`.
- **Negative cases — light already runs (`skips %s, which light already runs`)** — unit and cross-cutting test paths expected to return `false`.
- **Negative cases — not a jest test (`skips %s, which is not a jest test file`)** — source and helper files expected to return `false`.

## Relationships
- **`scripts/testing/suites.ts`** — the module under test. This file imports `isOutsideLightGate` from it and asserts its boolean output for a fixed set of path strings. No other imports or side effects.

## Notes
- The test file lives under `tests/unit/scripts/testing/`, mirroring the source path `scripts/testing/`. Adding a new positive/negative case only requires appending to the existing `it.each` arrays.
- The file-level JSDoc block (treated as module documentation) explains *why* both directions matter: a wrong `false` silently skips the commit gate; a wrong `true` causes redundant re-runs. Keep that block in sync if the gate semantics change.
- See `docs/tools/package-scripts.md` (referenced in the header) for the broader `complete:light` / pre-commit pipeline context.
