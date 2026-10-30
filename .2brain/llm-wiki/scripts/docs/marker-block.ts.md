---
source: scripts/docs/marker-block.ts
sha256: 79892144e50288978be147a71f79df83eb3a93c2fb03103868087f552f7fb2cb
generated_at: 2026-10-29T01:36:05.445966+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/marker-block.ts

## Purpose

Shared write-or-report logic for every doc generator in the `regenerate` pipeline. Each generator produces a body of Markdown and needs to splice it between a pair of HTML-comment markers (`<!-- name:start -->` / `<!-- name:end -->`) inside an otherwise hand-written page. This module handles the read, splice, prettier-format, and write-or-detect-drift cycle so no generator has to duplicate that boilerplate.

## Key elements

- **`MarkerBlock`** (interface) — Describes one generated block: its `start` marker string, `end` marker string, and the `body` to place between them.
- **`MarkerPageOptions`** (interface) — Bundles everything a single generator call needs: target `file` path, repo `root`, the ordered list of `blocks`, a log `label`, a `checkOnly` flag (CI mode), and a human-readable `driftSubject` for the failure message.
- **`applyMarkerBlocks`** (async function, the sole runtime export) — Reads the page, replaces each block in order between its markers, runs the whole page through Prettier (resolving the page's own config), then either writes the file (normal mode) or prints a drift warning and returns exit code 1 (`checkOnly`). Returns `0` on success/no-change, `1` on missing markers or drift.

## Relationships

All seven neighbors are doc generators that import `applyMarkerBlocks` (and the two interfaces) to write their respective sections into Markdown pages:

- `generate-module-graph.ts`, `generate-role-matrix.ts`, `generate-dependency-map.ts`, `generate-rate-limit-budgets.ts`, `generate-audit-actions.ts`, `generate-jobs.ts`, `generate-persona-tables.ts` — each constructs its own `MarkerBlock[]` and calls `applyMarkerBlocks` with a distinct `label`. They are the sole consumers of this module.

## Notes

- Blocks are spliced **sequentially** on a mutating string; each subsequent block's markers must still be locatable after prior replacements. Blocks must not overlap.
- Prettier is applied to the **entire page** after all splices, not just the inserted bodies. This keeps the file consistent with the `prettier --check` that `complete` runs over `docs/`.
- The no-op check compares the **formatted** result to the **original raw** read, so a page that is already correctly formatted and whose blocks are unchanged will not be rewritten.
- A missing marker pair is a hard error (exit 1) even in write mode — the file is left untouched.
- In `checkOnly` mode (used by CI's `complete` step), the error message tells the developer to run `npm run regenerate` and commit; no file is written.
