---
source: scripts/docs/marker-block.ts
sha256: 79892144e50288978be147a71f79df83eb3a93c2fb03103868087f552f7fb2cb
generated_at: 2026-11-08T02:49:07.814595+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/marker-block.ts

## Purpose

Shared write-or-report utility for every doc generator that embeds a generated section between `<!-- name:start -->` / `<!-- name:end -->` HTML-comment markers inside an otherwise hand-written Markdown page. It lets each generator replace only its own block (leaving all other hand-written text intact), format the result with the page's Prettier config, and either write the file or report drift — so the `complete` gate's `prettier --check` and the generator never disagree on the expected bytes.

## Key elements

- **`MarkerBlock`** (interface) — A single generated section: `start` / `end` marker strings and the `body` text to insert between them.
- **`MarkerPageOptions`** (interface) — All parameters one generator passes: target `file`, repo `root`, ordered `blocks` array, a `label` for log output, a `checkOnly` flag (CI/gate mode), and a `driftSubject` string for the failure message.
- **`applyMarkerBlocks`** (async function, the sole behavioral export) — Reads the page, splices each block's `body` in place of the existing content between its markers, runs Prettier on the full page, then either writes the file, reports it is unchanged, or (under `checkOnly`) prints an "out of date" message. Returns a process exit code (`0` clean/updated, `1` missing markers or drift).

## Relationships

Every file in the `scripts/docs/generate-*` family imports `applyMarkerBlocks` and the two interfaces to persist (or check) its generated section:

- `generate-module-graph.ts`, `generate-role-matrix.ts`, `generate-dependency-map.ts`, `generate-rate-limit-budgets.ts`, `generate-audit-actions.ts`, `generate-cookie-table.ts`, `generate-jobs.ts`, `generate-persona-tables.ts`

Each calls it once per target page with its own marker pair(s) and label, delegating all file I/O, marker splicing, and Prettier formatting to this module.

## Notes

- Blocks are applied **sequentially** via `indexOf` on the *mutating* string; later blocks see the positions shifted by earlier insertions. Pass them in top-to-bottom page order.
- The inserted `body` is always padded with `\n\n` on both sides before Prettier runs, so generators don't need to manage surrounding blank lines themselves.
- `checkOnly` mode performs the identical read → splice → format → compare pipeline but **never writes**; it only prints a one-line drift message naming `driftSubject`. This is what `npm run complete` exercises.
- Prettier config is resolved per-file via `resolveConfig(file)`, so a page under a different config (e.g. a nested `.prettierrc`) is honoured automatically.
