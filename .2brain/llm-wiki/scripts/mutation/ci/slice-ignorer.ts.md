---
source: scripts/mutation/ci/slice-ignorer.ts
sha256: 4c70e91fcd03c7425ff8007af825de60defe1a24c0b7a2fba57f529296283089
generated_at: 2026-10-01T12:32:46.427521+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/ci/slice-ignorer.ts

## Purpose

A Stryker ignore-plugin that constrains a single mutation run to a line range (slice) of a file. It exists so the GitHub CI sweep can split a file that would exceed one 6-hour job into smaller runs without losing or double-counting mutants at slice boundaries. Instead of Stryker's built-in `--mutate file:10-50` (which skips nodes *crossing* a boundary), this plugin keeps any node that *touches* the range, leaving deduplication to `merge.ts`.

## Key elements

- **`LineSlice`** – exported interface: `{ from, to }` (inclusive, 1-based line numbers).
- **`parseSlice(raw)`** – parses the `MUTATION_SLICE` env-var string (`"120-240"`) into a `LineSlice`; throws on malformed input so a typo cannot silently mutate the whole file inside an undersized job.
- **`outsideSlice(location, slice)`** – returns `true` only when a Babel node's `loc` is *entirely* above or below the slice. A node touching either edge stays in.
- **`SLICE_IGNORE_REASON`** – the exact `statusReason` string Stryker records on mutants skipped by this plugin; `merge.ts` uses it to distinguish "another slice tested this" from a manual `// Stryker disable`.
- **`strykerPlugins`** – the array Stryker loads via `appendPlugins` / `ignorers: ['ci-slice']`. Contains a single `Ignore`-kind plugin whose `shouldIgnore` returns `SLICE_IGNORE_REASON` when the node is outside the active slice, or `undefined` otherwise.
- **`activeSlice`** – module-level constant, read once from `process.env.MUTATION_SLICE`; `undefined` when the variable is unset (plugin is inert).

## Relationships

- **`scripts/mutation/ci/merge.ts`** – Consumes `SLICE_IGNORE_REASON` to identify mutants that were skipped solely because they fell outside this slice (as opposed to being disabled by a comment), then keeps one copy from whichever slice actually tested them.
- **`scripts/mutation/ci/waves.ts`** – The CI orchestrator that sets `MUTATION_SLICE` per job and wires this plugin into the Stryker config for each wave.
- **`tests/unit/scripts/mutation/ci/slice-ignorer.test.ts`** – Unit tests for `parseSlice`, `outsideSlice`, and the plugin's `shouldIgnore` behaviour.
- **`tests/unit/scripts/mutation/ci/merge.test.ts`** – Exercises the merge logic that relies on `SLICE_IGNORE_REASON` to deduplicate overlapping slices.

## Notes

- **No imports.** The file is loaded by Node's native type-stripping (not tsx), so it must use only erasable TypeScript syntax and cannot `import` from `@stryker-mutator/api`. The plugin object is hand-written to match the shape Stryker expects.
- **Inert by default.** Without `MUTATION_SLICE` set, `activeSlice` is `undefined` and `shouldIgnore` always returns `undefined` — the plugin changes nothing in a local or non-sliced run.
- **Slice edges are inclusive on both sides.** A node whose `end.line === slice.from` or `start.line === slice.to` is *not* outside; both adjacent slices will test it and `merge.ts` deduplicates.
- **Synthesised nodes (no `loc`)** are never considered outside — they are always kept.
