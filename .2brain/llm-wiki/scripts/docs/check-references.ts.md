---
source: scripts/docs/check-references.ts
sha256: 50230767ffef661a3ff934a3d5499c8cba63aa2942b0cf9b8ab0a912aa60c6e7
generated_at: 2026-10-14T07:14:00.688768+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/check-references.ts

## Purpose

Validates every file path that docs pages *claim* (via inline code spans) against the files that actually exist in the repo and the paired frontend repo. Complements `docs:build` (which only catches dead inter-page links) by catching a page that references a path that was renamed, merged away, or never existed. Run via `npm run check:docs-references`.

## Key elements

- **`run()`** — Entry point. Loads tsconfig path aliases, tracked file targets (own + peer), discovers all `docs/**/*.md` pages via `git ls-files`, scans each, reports findings, and enforces minimum floors before exiting.
- **`scanPage(markdown, context)`** — Walks a single page line-by-line, extracts inline code spans (`` `…` ``), and returns the tokens it recognised as path claims plus any that failed resolution.
- **`tokenOf(span, aliases, roots)`** — Reduces one code span to a `{path, anchor?}` claim by stripping locators (`:42`, trailing punctuation), rewriting `@alias/…` through tsconfig aliases, and rejecting non-path tokens.
- **`toPath(span)`** — The first-pass filter: rejects URLs, `./`-relative tokens, `/`-prefixed HTTP routes, and other non-path shapes; splits off any `#anchor`.
- **`isReal(claim, own, peer, anchorsOf)`** — Checks existence (suffix-resolved against tracked targets) and, for `#anchor` on an own-repo `.md` page, verifies the heading slug actually exists.
- **`headingSlugs(markdown)` / `slugify(heading)`** — Replicates VitePress's heading-slug algorithm (lowercase, strip punctuation, spaces→hyphens) and collects explicit `{#id}` overrides.
- **`anchorPageFor(pages)`** — Builds a suffix→page map so an anchor lookup can find the correct `.md` page without globbing the whole repo.
- **`MIN_PAGES` (90) / `MIN_REFERENCES` (300)** — Floor guards: if the sweep sees fewer pages or path claims than this, it fails loudly rather than reporting a false-clean tree.
- **`IGNORE_LINE`** — The string `<!-- doc-paths:ignore -->`; a line containing it is skipped entirely (for prose that deliberately names an absent path, e.g. rename tables).

## Relationships

- **`scripts/docs/repo-references.ts`** — Source of the shared path-resolution primitives: `trackedTargets`, `resolves`, `claimsAPath`, `readAliases`, `throughAliases`, `allowed`, `NOT_A_PATH`, `ROOT`, `ALLOWED`, and `gitEnvironment`. This file is the *consumer*; `repo-references.ts` is the *provider* of the resolution model.
- **`scripts/pairing/paired-frontend-path.ts`** — Provides `resolveFrontendPath()` and `DEFAULT_FRONTEND_PATH`. This script uses the default to compute `PEER_DIRECTORY` (the basename) and the resolved path to locate the peer checkout for cross-repo path validation.
- **`scripts/git-base.ts`** — Not directly imported here; likely a transitive dependency of `repo-references.ts` or `paired-frontend-path.ts` (e.g. for `gitEnvironment` or path helpers). No direct calls visible in this file.

## Notes

- **Suffix matching, not exact paths.** `orders/model.ts` in a doc span matches `src/modules/orders/model.ts` because resolution is by trailing-segment overlap. Pages don't need to spell root-relative paths.
- **Inline code spans only.** Fenced code blocks are treated as illustrative samples and deliberately excluded to avoid false positives.
- **Anchor checking is own-repo-only.** A `#anchor` on a peer-repo path is never validated (the peer's headings aren't in scope). Similarly, if the anchor target is a non-`.md` file, the anchor half is silently skipped.
- **`slugify` is approximate.** VitePress de-duplicates repeated headings with `-1`/`-2` suffixes; this script does not, so a genuine collision *under-reports* (fewer false negatives, no false positives).
- **Peer-repo check is soft.** If the paired repo isn't checked out (bare clone, worktree), cross-repo claims are skipped rather than treated as failures.
- **Floors are ratchets.** `MIN_PAGES` and `MIN_REFERENCES` are set just below current totals. They should only be raised as docs grow—never lowered to make a red run pass.
- **`anchorPageFor` is scoped to `docs/**/*.md`**, not every `.md` in the repo, to avoid matching anchors against `.2brain/llm-wiki/` generated mirrors.
