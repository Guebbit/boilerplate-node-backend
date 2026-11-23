---
source: scripts/docs/marker-block.ts
source_sha256: 386fe252cc6573c039ddd994fc906f279ea0935783e43d8418a183886c1b7fda
context_sha256: 6ef80fb661300e55f60496279923933e18a1adc42275d64211461b17449e5fbe
generated_at: 2026-11-22T02:04:23.938545+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/docs/marker-block.ts

## Purpose

Shared write-or-report logic for doc generators that keep a generated block between `<!-- name:start -->` / `<!-- name:end -->` markers inside an otherwise hand-written Markdown page. It replaces each block's contents, formats the result with the page's own prettier config, then either writes the file or (in check mode) reports drift. Formatting before comparing ensures it agrees with the `prettier --check` that `complete` also runs over `docs/`.

## Key elements

- `MarkerBlock` — interface: `start` marker line, `end` marker line, and generated `body` to put between them.
- `MarkerPageOptions` — interface describing one page job: `file` (absolute path), `root` (for relative log paths), `blocks`, `label` (log prefix), `checkOnly`, and `driftSubject` (used in the failure message).
- `applyMarkerBlocks(options)` — async function returning a process exit code:
  - Reads the page and replaces each block in order, keeping text up to the end of the start marker and from the start of the end marker, with `\n\n<body>\n\n` in between.
  - Returns `1` with an error log if any start/end marker is not found.
  - Formats the result via prettier (`resolveConfig(file)` plus `filepath`).
  - Returns `0` if the formatted result equals the original.
  - Under `checkOnly`, logs that the page is out of date and says to run `npm run regenerate`, then returns `1`.
  - Otherwise writes the file, logs `[label] <relative path> updated.`, and returns `0`.

## Relationships

Used by the doc generators `generate-audit-actions.ts`, `generate-dependency-map.ts`, `generate-jobs.ts`, `generate-module-graph.ts`, `generate-rate-limit-budgets.ts` and `generate-role-matrix.ts`. Each builds its own `MarkerBlock` bodies and calls `applyMarkerBlocks`. The header comment says these are `regenerate` doc steps, and `checkOnly` is what `complete` runs.

## Notes

- Everything outside the marker pairs, including hand-written text between blocks in the same page, is left untouched.
- Blocks are applied sequentially, and each marker is located with `indexOf` on the current page text. The end marker is searched from the start of the page, not after the start marker, and only the first occurrence of each is used.
- Nothing is written if any marker is missing, since the function returns before the write.
