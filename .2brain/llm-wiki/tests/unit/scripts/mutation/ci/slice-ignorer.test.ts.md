---
source: tests/unit/scripts/mutation/ci/slice-ignorer.test.ts
sha256: d765c37fa7f44db1a8ab8343123cb7c45609ae87665660718aac395f4d8b6de3
generated_at: 2026-11-08T10:38:36.773265+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/mutation/ci/slice-ignorer.test.ts

## Purpose

Unit tests for the Stryker slice-ignorer plugin (`scripts/mutation/ci/slice-ignorer.ts`). They pin the two invariants that the "whole-file result equals merged slices" proof (2026-09-30) rests on: a node that *touches* a slice boundary is kept (not ignored), and an unset `MUTATION_SLICE` causes the plugin to ignore nothing.

## Key elements

- **`node(start, end)`** – tiny helper that builds a fake AST node with 1-based `start.line` / `end.line` for use in `outsideSlice` and `shouldIgnore` assertions.
- **`pluginWith(slice)`** – sets `MUTATION_SLICE` via `setProcessEnvironment`, then loads a fresh copy of the module inside `jest.isolateModulesAsync` so the env var is read at module-init time. Returns the plugin's `shouldIgnore` callback.
- **`describe('parseSlice')`** – covers unset/empty input (→ `undefined`), valid inclusive ranges, and a table of malformed inputs (`'abc'`, `'12'`, `'0-5'`, `'9-3'`, `'1-2-3'`) that must throw with a `MUTATION_SLICE` message.
- **`describe('outsideSlice')`** – verifies boundary semantics: a node ending before or starting after the slice is outside; a node sharing a single boundary line or spanning the whole slice is *not* outside; `null`/`undefined` nodes are never ignored.
- **`describe('the ci-slice plugin')`** – integration-level checks that `strykerPlugins[0].value.shouldIgnore` returns `SLICE_IGNORE_REASON` for out-of-slice nodes and `undefined` for in-slice nodes (or when the slice is unset).

## Relationships

- **`scripts/mutation/ci/slice-ignorer.ts`** – the module under test. The test imports `parseSlice`, `outsideSlice`, `SLICE_IGNORE_REASON`, the `IgnorerPath` type, and dynamically imports `strykerPlugins`.
- **`tests/support/environment.ts`** – provides `setProcessEnvironment`, used by `pluginWith` to inject `MUTATION_SLICE` before each isolated module load.

## Notes

- `slice-ignorer.ts` reads `MUTATION_SLICE` **once at module load**, which is why `pluginWith` must use `jest.isolateModulesAsync` rather than simply mutating the env between tests.
- `parseSlice` deliberately **throws** on invalid input (including zero-based or inverted ranges) instead of falling back to the whole file — the test asserts the error message mentions `MUTATION_SLICE` to keep the failure diagnosable.
- The "touching" rule (a node whose `end.line === slice.from` or `start.line === slice.to` is kept) is the subtle edge the proof depends on; the two `node(1,10)` / `node(20,30)` cases are the regression guard.
