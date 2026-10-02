---
source: scripts/docs/check-references.ts
sha256: 2b8d6b92efaed0c45c6984f35f54a312cfd8ff59933778ad13689ccd74f05a2b
generated_at: 2026-10-01T12:28:51.392386+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/check-references.ts

## Purpose

A documentation linter (run via `npm run check:docs-references`) that verifies every file path cited in inline code spans within `docs/**.md` pages actually resolves to a tracked file or directory in this repo (or the paired frontend repo). It catches "dead facts" — paths in prose that no longer match the tree — which `docs:build`'s link checker does not cover because those are not hyperlinks.

## Key elements

- **`run()`** — Entry point. Loads aliases, tracked targets, peer-repo targets, and the page list from `git ls-files docs`; sweeps each page; prints findings; enforces floor thresholds.
- **`scanPage(markdown, context)`** — Extracts every inline code span in a page, normalises each via `tokenOf`, and checks it with `isReal`. Respects the `<!-- doc-paths:ignore -->` line-level opt-out.
- **`tokenOf(span, aliases, roots)`** — Reduces one code span to a `{ path, anchor? }` claim after stripping locators (`:42`), trailing punctuation/slashes, rewriting `@`-prefixed tokens through tsconfig path aliases, and filtering non-paths.
- **`toPath(span)`** — Lower-level parser: strips `#anchor`, `:locator`, trailing punctuation; rejects `./`, `../`, `http(s)://`, `/…` (HTTP routes), and non-path tokens.
- **`isReal(claim, own, peer, anchorsOf)`** — Resolves the path against the own or peer target set; if an `#anchor` is present and the target is a tracked `.md` page, validates the slug against that page's headings.
- **`headingSlugs(markdown)` / `slugify(heading)`** — Approximate VitePress heading-slug extraction (lowercase, strip markdown chars, spaces→hyphens). Does **not** replicate VitePress's `-1`/`-2` de-dup suffixes, so collisions under-report.
- **`anchorPageFor(pages)`** — Builds a suffix→page map scoped to `docs/**` pages so an anchor lookup resolves to the correct page without matching generated `.2brain/` mirrors.
- **`MIN_PAGES` (90) / `MIN_REFERENCES` (300)** — Floor thresholds. If the sweep sees fewer pages or references, it fails hard rather than reporting a vacuously clean tree.
- **`IGNORE_LINE`** — The `<!-- doc-paths:ignore -->` marker that exempts a single line from checking (used for rename tables, "why this file was merged" prose, etc.).
- **`PEER_DIRECTORY`** — `path.basename(DEFAULT_FRONTEND_PATH)`, used to detect and route cross-repo citations.

## Relationships

- **`scripts/docs/repo-references.ts`** — Primary dependency. Imports the path-resolution primitives (`trackedTargets`, `resolves`, `claimsAPath`, `readAliases`, `throughAliases`), constants (`ROOT`, `ALLOWED`, `NOT_A_PATH`), the `allowed()` filter, and `gitEnvironment()`. This file is the consumer; `repo-references.ts` is the shared engine.
- **`scripts/pairing/paired-frontend-path.ts`** — Supplies `resolveFrontendPath()` (to locate the peer checkout) and `DEFAULT_FRONTEND_PATH` (to derive `PEER_DIRECTORY`). When the peer checkout is absent, cross-repo resolution is skipped, not failed.
- **`scripts/git-base.ts`** — Appears in the dependency graph (likely a transitive dependency through `repo-references.ts`); no direct import visible in this file.

## Notes

- **Floors are ratchet-only.** The comment explicitly says "Raise them when the docs grow; never lower them to make a run pass." They exist so a broken sweep (e.g., wrong `git ls-files` output) fails loudly instead of silently reporting zero findings.
- **Slug matching is approximate on purpose.** VitePress de-duplicates repeated headings with `-1`/`-2`; this file does not, so a genuine collision will under-report (miss a finding) rather than over-report (false positive).
- **Anchor checking is scoped to `docs/**` pages only.** A `.2brain/llm-wiki/` mirror of a source file is deliberately excluded from `anchorPageFor`, so an anchor on a non-page target is simply skipped rather than matched against a generated summary.
- **Peer-repo citations resolve by directory name, not package name.** Citing the peer by its npm package name (rather than its directory) will not resolve and will be reported as a finding.
- **Line-level opt-out, not page-level.** `<!-- doc-paths:ignore -->` must appear on the specific line containing the deliberately-absent path; it does not suppress the whole file.
- **`@`-prefixed tokens that match no tsconfig alias** (e.g., `@asyncapi/cli`) are treated as npm packages and skipped.
- **Fenced code blocks are excluded entirely** — they are treated as illustrative samples, not claims about the repo tree.
