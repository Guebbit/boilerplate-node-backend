---
source: scripts/docs/marker-block.ts
sha256: 7eab689e35aa1c11478b982706633190dc238d18c15110722ca34738db118988
generated_at: 2026-09-27T13:56:14.840480+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/marker-block.ts

## Purpose

Shared utility that replaces the content between `<!-- name:start -->` / `<!-- name:end -->` HTML-comment markers inside a Markdown docs page. Every doc generator that keeps a machine-generated section within an otherwise hand-written page uses this module so that only the block between the pair is rewritten while all surrounding prose stays intact.

## Key elements

- **`MarkerBlock`** (interface) — Describes one generated block: the `start` marker, the `end` marker, and the `body` string to place between them.
- **`MarkerPageOptions`** (interface) — Bundles everything `applyMarkerBlocks` needs: file path, repo root, the ordered list of blocks, a log label, `checkOnly` flag, and human-readable drift/rerun hints for `--check` mode.
- **`applyMarkerBlocks`** (async function, the sole export that does work) — Reads the target page, replaces each marker pair in sequence, formats the result with the page's Prettier config, then either writes the file (normal mode) or reports drift and returns exit code 1 (`checkOnly` mode). Returns `0` when the page is clean or was updated, `1` when a marker pair is missing or drift is detected.

## Relationships

- **`scripts/docs/generate-module-graph.ts`** (`docs:graph`) — Calls `applyMarkerBlocks` to write its generated graph block.
- **`scripts/docs/generate-role-matrix.ts`** (`docs:roles`) — Calls `applyMarkerBlocks` to write its role-matrix block.
- **`scripts/docs/generate-dependency-map.ts`** (`docs:dependencies`) — Calls `applyMarkerBlocks` to write its dependency-map block.
- **`scripts/docs/generate-rate-limit-budgets.ts`** (`docs:rate-limits`) — Calls `applyMarkerBlocks` to write its rate-limit-budget block.

All four pass `checkOnly: true` when invoked from `complete` and `checkOnly: false` when run as a standalone `npm run docs:*` script.

## Notes

- Blocks are applied **in array order** via successive `indexOf` searches on the already-mutated string. If two blocks share a marker name, the first occurrence wins — marker names must be unique per page.
- Prettier formatting runs **before** the equality check, because the `complete` pipeline also runs `prettier --check` over `docs/`. Skipping this step would make the two checks disagree on the same file.
- The function reads/writes synchronously (`readFileSync` / `writeFileSync`); only the Prettier `format` call is awaited.
- The `root` option exists solely to produce a repo-relative path in log output; it is not used for file resolution.
