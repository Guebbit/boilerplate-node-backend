---
source: scripts/mutation/ci/slice-ignorer.ts
source_sha256: 43fea89e1ee255f1c0e6df24ef4bd667fe737132e2dfb3db30af46f08a61c2d7
context_sha256: a56ed82ad21d7484288049605997fae06530c3462ab6eda6af02ea951c11fec2
generated_at: 2026-11-22T02:08:39.290059+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/mutation/ci/slice-ignorer.ts

## Purpose
A Stryker ignorer plugin that narrows a mutation run to a line slice of one file. The GitHub sweep uses it to split a file that is too slow for a single 6-hour job across several jobs without losing or changing any mutant. Stryker's `--mutate file:10-50` only mutates nodes wholly inside the range, so a node that crosses a slice edge (a function body, a schema object) would be mutated by no slice. This ignorer instead skips every subtree that does not touch the slice, so a node crossing an edge is tested by both neighbouring slices.

## Key elements
- `LineSlice`: an inclusive, 1-based `{ from, to }` line range.
- `IgnorerPath`: the minimal shape of the Babel `NodePath` that Stryker passes to an ignorer (`node.loc`).
- `SLICE_IGNORE_REASON` (`'Outside this CI slice'`): the `statusReason` recorded on mutants this ignorer skips.
- `parseSlice(raw)`: parses `MUTATION_SLICE` (e.g. `"120-240"`). Empty or unset returns `undefined`. Anything that is not a valid range (non-matching format, `from < 1`, or `to < from`) throws.
- `outsideSlice(location, slice)`: returns true only when a node ends before the slice or starts after it. A node with no location is never outside.
- `strykerPlugins`: the exported plugin array, a single `Ignore` plugin named `ci-slice`. Its `shouldIgnore` returns `SLICE_IGNORE_REASON` for nodes outside the slice and `undefined` otherwise.

## Relationships
- `merge.ts`: relies on `SLICE_IGNORE_REASON` to tell a mutant "another slice tested this" apart from one skipped by a `// Stryker disable` comment. When slices overlap, it keeps one result per mutant.
- `waves.ts`: listed as a graph neighbour. The visible content does not show how the two interact.
- `tests/unit/scripts/mutation/ci/slice-ignorer.test.ts`: unit tests for this file.
- `tests/unit/scripts/mutation/ci/merge.test.ts`: tests the merge side that consumes the ignore reason.

## Notes
- The file is loaded by Node's native type stripping, not tsx. It therefore has no imports and may only use erasable TypeScript syntax. The plugin is written as a plain object in the shape `declareValuePlugin(PluginKind.Ignore, …)` returns, to avoid importing `@stryker-mutator/api`.
- The plugin is loaded via Stryker's `appendPlugins` and enabled with `ignorers: ['ci-slice']`.
- With no `MUTATION_SLICE`, it ignores nothing.
- `MUTATION_SLICE` is read once at module load into `activeSlice`, because `shouldIgnore` runs for every node of every file.
- An invalid `MUTATION_SLICE` throws at load rather than falling back, so a typo cannot silently mutate the whole file in a job sized for a fraction of it.
- Stryker skips a whole subtree once `shouldIgnore` answers for its root. This is why the only safe test is "does not touch the slice".
