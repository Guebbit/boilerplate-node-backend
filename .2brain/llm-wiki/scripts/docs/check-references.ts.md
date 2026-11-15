---
source: scripts/docs/check-references.ts
sha256: d24c73bca7484246f0e1ec9a9292714466624981fb9ac77ff605cdab5cfae59f
generated_at: 2026-11-14T17:30:41.730509+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/check-references.ts

## Purpose

Validates that every file path and heading anchor claimed in inline code spans, markdown links, and script references across `docs/**/*.md` actually exists in the repository (or the paired frontend). Complements `docs:build`, which catches dead links, by catching dead *facts*—paths that were renamed, deleted, or never existed. Run via `npm run check`.

## Key elements

- **`run()`** — Entry point. Enumerates tracked `docs/**\/*.md` pages, scans each for path claims and broken link anchors, checks dead code citations outside `docs/`, checks `npm run` script names, and enforces floor thresholds before reporting findings.
- **`scanPage(markdown, context)`** — Iterates one page's inline code spans line-by-line, collecting resolved path tokens and flagging unresolved ones as findings.
- **`toPath(span)`** — Normalizes a raw code-span string into a `{ path, anchor? }` or `undefined`. Strips trailing `:line`/`:name` locators, trailing slashes, and terminal punctuation; excludes URLs, relative paths (`./`, `../`), and HTTP routes (`/…`).
- **`tokenOf(span, aliases, roots)`** — Applies alias rewriting, then confirms the path is a tracked target in one of the known roots and not in the `ALLOWED` exclusion list.
- **`isReal(claim, own, peer, anchorsOf)`** — Resolves a claim against the own-repo target set or the peer-repo target set (by `PEER_DIRECTORY` prefix); additionally validates `#anchor` against the target page's heading slugs.
- **`brokenLinkAnchors(page, markdown, anchorsOf)`** — Finds `[text](page.md#anchor)` links whose anchor no heading on the target page answers to (fence-aware, skips non-`.md` and external targets).
- **`anchorPageFor(pages)`** — Builds a suffix→full-path map over the docs pages so a claim like `repository.ts#findByIdScoped` can be matched to the page that actually contains that heading.
- **`deadScriptFindings(pages, peerRoot)`** — Collects `npm run <name>` claims in docs and flags names absent from both this repo's and the peer's `package.json` scripts.
- **`MIN_PAGES` / `MIN_REFERENCES`** (90 / 300) — Floor guards: if the sweep sees fewer pages or references than these, it fails loudly rather than silently reporting a clean tree.
- **`IGNORE_LINE`** (`<!-- doc-paths:ignore -->`) — Per-line opt-out marker for deliberate references to absent paths.

## Relationships

- **`scripts/docs/repo-references.ts`** — Supplies the core path-claiming vocabulary: `ALLOWED`, `allowed`, `NOT_A_PATH`, `trackedTargets`, `resolves`, `claimsAPath`, `readAliases`, `throughAliases`, `gitEnvironment`. All alias resolution and "is this a real tracked path?" decisions delegate here.
- **`scripts/docs/code-citations.ts`** — Provides `deadCodeCitations` (for citations in non-docs files like contract YAML, `.env-example`) and `headingSlugs` (parses a page's headings into slug set for anchor validation).
- **`scripts/docs/document-facts.ts`** — Provides `missingScripts`, which compares `npm run` names found in doc text against the known script set.
- **`scripts/modules-on-disk.ts`** — Exports `REPO_ROOT` (aliased as `ROOT`), the canonical path to this repository's root used for all file reads and `git ls-files` invocations.
- **`scripts/pairing/paired-frontend-path.ts`** — Exports `resolveFrontendPath` and `DEFAULT_FRONTEND_PATH`; used to locate the peer (frontend) checkout and to derive `PEER_DIRECTORY` for cross-repo path resolution.
- **`scripts/git-base.ts`** — Graph neighbor reached transitively (no direct import in this file).

## Notes

- The floor thresholds (`MIN_PAGES`, `MIN_REFERENCES`) are intentionally set just below the current tree size. They must be **raised** as docs grow; lowering them to make a failing run pass is explicitly discouraged by the in-file comment.
- Cross-repo (peer) path checks are **skipped, not failed**, when the peer `.git` directory is absent (bare clone, worktree). This means a broken peer reference is invisible in that environment.
- Anchor validation only applies to `.md` pages in *this* repo. A `#anchor` on a non-`.md` target or a peer-repo path is silently accepted.
- `anchorPageFor` is deliberately scoped to the `docs/**/*.md` page list (from `git ls-files docs`), **not** every `.md` file the repo tracks. This prevents a claim like `orders/repository.ts#findByIdScoped` from being accidentally matched against a generated `.2brain/llm-wiki/orders/repository.ts.md` mirror page.
- The `slugsCache` in `run()` ensures each cited page's headings are parsed at most once, regardless of how many code spans on various pages cite the same anchor.
- Fence-block aware: `brokenLinkAnchors` tracks ```/~~~ fences so that code blocks containing link-like syntax are not treated as real links.
