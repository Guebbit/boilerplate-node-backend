---
source: scripts/docs/check-references.ts
sha256: 327d696ceb960c53f9cb3979ac64ede4d750dc6fc8a9670d1d4995936b448a3c
generated_at: 2026-09-23T17:24:52.782841+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/check-references.ts

## Purpose

Sweeps every markdown page under `docs/` for file paths cited in inline code spans and verifies each one resolves to a file (or directory) that actually exists in the repo tree or the paired frontend checkout. It exists because `docs:build` catches dead *links* between pages but nothing else catches a page naming a file that was renamed, moved, or deleted a year ago. Run via `npm run check:docs-references`.

## Key elements

- **`toPath(span)`** — Normalizes a single inline-code span into a candidate path token, or returns `undefined` for things that are not repo paths (URLs, `./`-relative VitePress links, `/`-prefixed HTTP routes, flags, shell variables, etc.). Strips trailing `:line`, `#anchor`, punctuation, and slashes.
- **`scanPage(markdown, context)`** — Iterates lines of one page, collects all code-span tokens and flags those that fail resolution. Lines containing the ignore marker are skipped entirely.
- **`tokenOf(span, aliases, roots)`** — Applies `toPath`, then `throughAliases` (tsconfig `@`-alias rewrite), then filters out allowed / non-path tokens. Returns the canonical repo-relative token or `undefined`.
- **`isReal(token, own, peer)`** — Resolution check: if the token starts with the peer directory name it resolves over the paired repo's tracked targets; otherwise over the local repo. Missing peer checkout causes a silent skip, not a failure.
- **`run()`** — Orchestrates the sweep: reads aliases, builds local + peer target sets, enumerates pages via `git ls-files docs`, scans each, applies the floor check, and prints findings grouped by page.
- **`PEER_DIRECTORY`** — `path.basename(DEFAULT_FRONTEND_PATH)`; the directory name under which cross-repo citations are expected to appear.
- **`MIN_PAGES` (90) / `MIN_REFERENCES` (300)`** — Floor canaries. If the sweep reads fewer pages or references than these, it exits 1 with an error rather than reporting a vacuous pass.
- **`IGNORE_LINE`** — The literal string `<!-- doc-paths:ignore -->`; a line-scoped opt-out for prose that deliberately names an absent path (rename tables, deprecation notes).
- **`Finding`** — `{ page, token }` pair describing one unresolved claim.

## Relationships

- **`scripts/docs/repo-references.ts`** — Supplies the core resolution machinery this script composes: `ROOT`, `ALLOWED` / `allowed` (whitelist of intentionally absent paths), `NOT_A_PATH` regex, `trackedTargets` (git-tracked file/directory set + root prefixes), `resolves` (suffix-based existence check), `claimsAPath` (does the token look like a path under a known root?), `readAliases` (tsconfig `paths`), and `throughAliases` (rewrite `@prefix/…` tokens).
- **`scripts/pairing/paired-frontend-path.ts`** — Provides `resolveFrontendPath()` (locate the sibling frontend checkout) and `DEFAULT_FRONTEND_PATH` (its directory name, used to recognize cross-repo citations).

## Notes

- **Suffix resolution, not exact match.** A page may write `orders/model.ts` and it will match `src/modules/orders/model.ts`. Pages do not need to spell the full root path.
- **Cross-repo checks degrade gracefully.** If the paired frontend is not checked out (bare clone, worktree, CI without the sibling), the peer target set is `undefined` and cross-repo tokens are silently skipped rather than failing the build.
- **Floor values are load-bearing.** `MIN_PAGES` and `MIN_REFERENCES` are deliberately set just below current counts. The comment states they should be raised as docs grow and *never* lowered to make a run pass. A sweep that reads zero pages must fail.
- **`ALLOWED` is the escape hatch.** Paths that genuinely do not exist but must be cited (legacy names, planned files) go in `ALLOWED` with a reason rather than using the line-level ignore marker.
- **Only tracked files are swept.** Page enumeration uses `git ls-files docs`, so uncommitted or generated `.md` files outside git's index are invisible to this check.
- **Inline code spans only.** Fenced code blocks are treated as samples and are never scanned, to avoid false positives from example code that does not describe this repo.
