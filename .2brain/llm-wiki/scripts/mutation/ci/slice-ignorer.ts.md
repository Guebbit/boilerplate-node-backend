---
source: scripts/mutation/ci/slice-ignorer.ts
sha256: 4c70e91fcd03c7425ff8007af825de60defe1a24c0b7a2fba57f529296283089
generated_at: 2026-11-08T02:53:09.419225+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/ci/slice-ignorer.ts

## Purpose

A Stryker ignore-plugin that restricts a single CI run to a line **slice** of a file (e.g. lines 120–240), letting the GitHub mutation sweep split a slow file across parallel 6-hour jobs without losing or duplicating mutants. Unlike Stryker's native `--mutate file:10-50`, which only mutates nodes *wholly inside* the range, this plugin ignores any subtree that does not *touch* the slice — so a node crossing a slice edge is tested by both neighbouring jobs and deduplicated by `merge.ts`.

## Key elements

- **`LineSlice`** — exported interface: an inclusive, 1-based `{ from, to }` line range.
- **`NodeLocation`** — internal interface mirroring the minimal Babel `SourceLocation` shape (`start.line`, `end.line`).
- **`IgnorerPath`** — exported interface for the subset of Babel `NodePath` the ignorer reads.
- **`SLICE_IGNORE_REASON`** — exported constant (`'Outside this CI slice'`). The `statusReason` Stryker records on skipped mutants; `merge.ts` uses it to distinguish slice-skipping from user `// Stryker disable` comments.
- **`parseSlice(raw)`** — parses the `MUTATION_SLICE` env-var value (`"120-240"`) into a `LineSlice`. Throws on malformed input rather than silently falling back to no-slice.
- **`outsideSlice(location, slice)`** — returns `true` only when a node's range is entirely above or below the slice; touching either boundary keeps the node in.
- **`strykerPlugins`** — the array Stryker loads via `appendPlugins`. Contains one `Ignore`-kind plugin named `ci-slice` whose `shouldIgnore` callback consults the process-level `activeSlice`.

## Relationships

- **`scripts/mutation/ci/merge.ts`** — reads `SLICE_IGNORE_REASON` from mutant results to tell "tested by a sibling slice" apart from a user-written disable comment when merging partial runs.
- **`tests/unit/scripts/mutation/ci/slice-ignorer.test.ts`** — unit-tests `parseSlice`, `outsideSlice`, and the `shouldIgnore` callback.
- **`tests/unit/scripts/mutation/ci/merge.test.ts`** — exercises `merge.ts`'s handling of `SLICE_IGNORE_REASON` in merged reports.

## Notes

- **No imports.** The file is loaded by Node's native type-stripping (not tsx), so it must use only erasable TypeScript syntax (interfaces, `const`, no `enum`/`namespace`/`class`). It deliberately inlines the plugin object shape rather than importing `@stryker-mutator/api`.
- **`activeSlice` is read once at module load.** The `shouldIgnore` callback runs for every AST node in every file, so the env var is parsed eagerly and cached in a module-level `const`.
- **Inert without `MUTATION_SLICE`.** If the variable is unset or empty, `parseSlice` returns `undefined` and `shouldIgnore` always returns `undefined` — nothing is ignored.
- **Validation is strict.** A malformed `MUTATION_SLICE` (e.g. `"240-120"`, `"abc"`) throws immediately; it does *not* degrade to "mutate the whole file," which would overflow a job sized for a fraction.
