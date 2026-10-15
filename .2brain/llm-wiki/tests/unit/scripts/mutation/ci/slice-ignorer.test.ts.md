---
source: tests/unit/scripts/mutation/ci/slice-ignorer.test.ts
sha256: d765c37fa7f44db1a8ab8343123cb7c45609ae87665660718aac395f4d8b6de3
generated_at: 2026-10-15T13:28:30.684613+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/mutation/ci/slice-ignorer.test.ts

## Purpose

Unit tests for the Stryker ignorer plugin in `slice-ignorer.ts`. They pin two invariants that a prior full-Stryker-run proof (2026-09-30) relied on: a node that *touches* the slice is kept, and an absent slice is a no-op. They also guard `parseSlice` against accepting malformed input that would silently mutate the whole file.

## Key elements

- **`node(start, end)`** — local helper that builds a `{ start: { line }, end: { line } }` object (1-based) for use in assertions.
- **`pluginWith(slice)`** — sets `MUTATION_SLICE` via `setProcessEnvironment`, then re-loads `slice-ignorer.ts` inside `jest.isolateModulesAsync` to capture a fresh `shouldIgnore` (the module reads the env var once at import time).
- **`describe('parseSlice')`** — verifies that `undefined`/`''` yield `undefined`, valid ranges parse correctly, and invalid inputs (`'abc'`, `'12'`, `'0-5'`, `'9-3'`, `'1-2-3'`) throw a message mentioning `MUTATION_SLICE`.
- **`describe('outsideSlice')`** — checks boundary semantics: nodes ending before or starting after the slice are outside; single-line overlap and whole-span are inside; `undefined`/`null` nodes are never outside.
- **`describe('the ci-slice plugin')`** — end-to-end checks that `shouldIgnore` returns `SLICE_IGNORE_REASON` for out-of-slice nodes and `undefined` for in-slice nodes, and returns `undefined` across the board when no slice is set.

## Relationships

- **`scripts/mutation/ci/slice-ignorer.ts`** — the module under test. The file imports `parseSlice`, `outsideSlice`, `SLICE_IGNORE_REASON`, and the `IgnorerPath` type from it; `pluginWith` dynamically imports its exported `strykerPlugins` array.
- **`tests/support/environment.ts`** — provides `setProcessEnvironment`, used by `pluginWith` to control `MUTATION_SLICE` before the isolated module load.

## Notes

- The module reads `MUTATION_SLICE` **once at import time**, so plain `process.env` mutation after import has no effect. Tests must use `jest.isolateModulesAsync` to get a fresh module instance with the desired env value.
- `parseSlice` intentionally **throws** on malformed input (single number, zero-based range, inverted range, extra dashes) rather than falling back to "no slice." The test cases are a regression guard for that fail-closed behavior.
- `outsideSlice` treats `undefined`/`null` nodes as *inside* (i.e., never ignored). This is a deliberate safety default: a missing location means "don't skip this node."
