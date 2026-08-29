# scripts/report-heap-summary.ts

## Purpose

CLI tool that produces a ranked summary of a V8 `.heapsnapshot` file (top-N object kinds by self-size). It exists because any heap snapshot of meaningful size exceeds V8's maximum string length, so the naive `JSON.parse(readFileSync(...))` approach fails with `ERR_STRING_TOO_LONG` before parsing even starts. This script instead walks the file in chunks, never holding more than one buffer in memory.

## Key elements

- **`readHeader`** — Reads the first 64 KiB of the file and extracts `node_fields` (the column layout) and `node_types` (type-name table) via regex. Returns the indices of `type`, `name`, and `self_size` columns.
- **`streamArray(key, onChunk)`** — Generic helper that streams a single top-level bracketed array (`nodes` or `strings`) out of the file. Uses a character-by-character scanner that tracks string-literal state and bracket depth so it correctly handles escaped quotes and brackets inside string values. Yields raw text chunks; destroys the stream once the matching `]` is reached.
- **`main`** — Orchestrates three passes: (1) header read, (2) `nodes` aggregation into a `Map<"typeIdx|nameIdx", {bytes, count}>`, (3) `strings` pass that resolves only the name indices that survived the top-N ranking. Prints a formatted table to stdout.
- **`mb(bytes)`** — Small helper formatting bytes as megabytes.
- **`byKind`** (local Map) — Accumulates total self-size bytes and instance count per (type, name) pair during the `nodes` pass.

## Relationships

No graph neighbors. This file is a standalone script with no imports from project source and no exports.

## Notes

- **Two-pass strings:** The `strings` array is only partially resolved. After ranking in the `nodes` pass, the script builds a `wanted` set of name indices and skips all other entries during the `strings` pass, keeping memory bounded.
- **Chunk-boundary carry:** Both `nodes` and `strings` passes maintain a `carry` variable to handle values split across chunk boundaries (a number or string cut in half at a read boundary).
- **String-aware bracket scanning:** `streamArray` does not use a regex to find the closing `]`. It walks code points, tracking `inString` and `escaped` flags, because string values in `strings` contain literal `[`, `]`, and `"` characters that would break a naive bracket-count.
- **Invocation:** `npx tsx scripts/report-heap-summary.ts <file.heapsnapshot> [topN]` (default topN = 25). The heap snapshot is typically produced by running Node with `--heapsnapshot-near-heap-limit=1`.
- **Interpretation heuristic (printed by the script):** one dominant kind indicates a leak; an even spread is a healthy working set.
