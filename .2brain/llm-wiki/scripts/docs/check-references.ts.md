---
source: scripts/docs/check-references.ts
source_sha256: 7dd9347fcf5d77712b9b1af8643ab44cf5f35f3f0b933d776289595ddbc61a2f
context_sha256: dda865e70195330f82f823434e15a181c167d648cb512f2c91a630002946f376
generated_at: 2026-11-22T02:01:44.107173+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/docs/check-references.ts

## Purpose
A CLI (`tsx`, run via `npm run check`) that verifies every file path the docs *claim* exists actually does. `docs:build` rejects dead links; this script rejects dead facts, meaning inline-code path citations, `#anchor` locators, and `npm run` script names. It enforces minimum floors on pages and references scanned so a sweep that silently reads nothing cannot report a clean tree.

## Key elements
- `MIN_PAGES` (90) / `MIN_REFERENCES` (300): floors on pages read and references found. The comments say to raise them as docs grow and never lower them to make a run pass.
- `IGNORE_LINE` (`<!-- doc-paths:ignore -->`): a line containing it is skipped, for deliberately naming an absent path.
- `PEER_DIRECTORY`: basename of the paired frontend repo. Citations prefixed with it resolve against that repo.
- `toPath(span)`: normalizes an inline code span into `{path, anchor?}`. It drops URLs, relative `./` and `../` paths, and `/` HTTP routes. It strips `:locator` suffixes, trailing punctuation and trailing slashes.
- `tokenOf(span, aliases, roots)`: runs `toPath`, applies aliases, and discards anything that doesn't look like a repo path or is on the allowlist. Returns a `Claim`.
- `isReal(claim, own, peer, anchorsOf)`: checks that the file exists. For `.md` pages in this repo it also checks that the anchor matches a heading. Peer-repo citations resolve against the peer's tracked files and are skipped when no peer checkout exists.
- `scanPage(markdown, context)`: scans one page line by line for backtick spans and returns the resolved `tokens` and the unresolved `findings`.
- `brokenLinkAnchors(page, markdown, anchorsOf)`: finds Markdown links with an `#anchor` (to another page or to the same page) whose anchor matches no heading in the target page. It skips fenced code blocks and non-`.md` or external targets.
- `anchorPageFor(pages)`: maps every path-suffix of each `docs/**/*.md` page to its full path. It is deliberately scoped to docs pages so that `.2brain/llm-wiki/*.md` mirrors are not treated as pages.
- `scriptNamesIn(directory)` / `deadScriptFindings(pages, peerRoot)`: collect `package.json` script names from this repo and the peer, then report `npm run` claims that no script matches. This is skipped without a peer.
- `run()`: orchestrates the sweep and returns the exit code. It builds the alias, root and tracked-target sets, lists docs pages with `git ls-files docs`, caches heading slugs per page, and scans each page for path claims and broken link anchors. It also uses `anchorsOf` for anchor lookups, and it goes on to run further checks, but the source is truncated at that point.
- `Finding` / `Scan` / `Claim`: small interfaces for results.

## Relationships
- `repo-references.ts`: supplies the core resolution helpers: `ALLOWED`, `allowed`, `NOT_A_PATH`, `trackedTargets`, `resolves`, `claimsAPath`, `readAliases`, `throughAliases` and `gitEnvironment`.
- `code-citations.ts`: supplies `headingSlugs` (anchor validation), `anchorlessSeeTags` and `deadCodeCitations`. The last two are imported, but their use falls in the truncated part of the file.
- `document-facts.ts`: supplies `missingScripts` (used by `deadScriptFindings`) and `missingFrontMatter`. `missingFrontMatter` is imported, but its use is not visible in the shown portion. `tests/unit/scripts/docs/document-facts.test.ts` tests that module.
- `scripts/pairing/paired-frontend-path.ts`: supplies `resolveFrontendPath` and `DEFAULT_FRONTEND_PATH` for locating the paired frontend repo.
- `modules-on-disk.ts`: supplies `REPO_ROOT`, imported as `ROOT`.
- `scripts/git-base.ts`: listed as a graph neighbor, but no direct use appears in the visible portion.

## Notes
- The peer-repo half of the check is skipped, not failed, when the peer has no `.git` (bare clone or worktree).
- Anchors are only verified for `.md` pages tracked under `docs/`. Anchors on other files go unchecked.
- Git is run with the environment from `gitEnvironment()`.
- The file's header comment points to a documentation-style page for what the sweep covers and why each narrowing matters.
