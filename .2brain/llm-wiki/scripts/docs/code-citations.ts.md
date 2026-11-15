---
source: scripts/docs/code-citations.ts
sha256: 577b909d6ab03a29f1eb4176a8d0a25469000a6391090941b614281bc1540586
generated_at: 2026-11-14T17:30:56.772363+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/code-citations.ts

## Purpose

Detects dead `docs/….md` references that appear **outside** the `docs/` directory (in `src/`, `scripts/`, YAML contracts, and `.env-example`). For each citation it verifies the page is git-tracked and, if a `#anchor` is given, that the anchor corresponds to a real heading slug. It mirrors the resolution logic in `check-references.ts` but targets citations embedded in non-docs files.

## Key elements

- **`headingSlugs(markdown: string): Set<string>`** (exported) — Parses raw Markdown and returns every valid anchor slug for the page. Handles explicit `{#custom-id}` suffixes, strips inline links/code/emphasis before slugifying with VitePress's `slugify`, deduplicates repeated headings (`-1`, `-2`), and skips `#` lines inside fenced code blocks.
- **`CITATION`** (module-private regex) — Matches `docs/<path>.md` with an optional `#anchor`. A lookbehind `(?<![\w/.:-])` prevents matching paths that are part of a URL, a `../`-relative path, or a peer repo's `<dir>/docs/…`.
- **`isCitingFile(file: string): boolean`** (module-private) — Gate predicate: the file must live under `src/` or `scripts/`, be a `.yml`/`.yaml` file, or be exactly `.env-example`; it must **not** be under `docs/` or `.2brain/`.
- **`deadCodeCitations(root: string, files: string[]): string[]`** (exported) — Walks the tracked file list, reads each citing file, extracts every citation, and returns one `file: docs/…` (or `file: docs/…#anchor`) line per unresolved reference. Caches per-page slug computation so a page cited by many files is parsed only once.

## Relationships

- **`scripts/docs/check-references.ts`** — Sibling module that resolves citations *within* a doc page. This file reuses the same slug-resolution strategy (VitePress `slugify` + markdown-it-anchor dedup) but applies it to citations found in non-docs files.
- **`tests/unit/scripts/docs/code-citations.test.ts`** — Unit tests exercising `headingSlugs` and `deadCodeCitations` directly.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — CI mutation-testing suite that includes this module in its wave; the tests confirm the file participates in the pipeline's mutation coverage.

## Notes

- Slug computation deliberately uses `@mdit-vue/shared`'s `slugify` rather than a generic library, so anchors match exactly what VitePress generates at build time.
- The `CITATION` regex lookbehind is the mechanism that keeps peer-repo paths like `other-project/docs/….md` from being flagged; the pattern does **not** simply match any `docs/` substring.
- `decodeURIComponent` is applied to anchors before lookup, so percent-encoded slugs in citations resolve correctly.
- Trailing sentence punctuation (`.:!?`) is stripped from captured anchors, since prose like `see `docs/x.md#intro`.` would otherwise include the period.
- The module is intentionally narrow: it does not validate wording, coverage, or citation counts—only whether the target exists.
