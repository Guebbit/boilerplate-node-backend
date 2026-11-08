---
source: scripts/docs/check-references.ts
sha256: 1ae019571262dfe456e0171aae83a8f6353da5b7e3d9d239d942880887af4040
generated_at: 2026-11-08T02:46:33.527658+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/check-references.ts

## Purpose

CLI sweep (wired to `npm run check`) that verifies every file path cited in an inline code span across `docs/**/*.md` pages actually resolves to a tracked file in this repo or the paired frontend repo, and—when an `#anchor` is included—that the target page carries a matching heading. It is the "dead fact" counterpart to `docs:build`'s "dead link" check.

## Key elements

- **`run`** — Entry point. Enumerates docs pages via `git ls-files docs`, scans each, enforces minimum-page/reference floors, prints findings, and sets `process.exitCode`.
- **`scanPage`** — Walks one page line-by-line, extracts inline code spans, classifies each as a path claim (or skips it), and collects unresolved tokens as findings. Honors the per-line `IGNORE_LINE` opt-out.
- **`tokenOf`** — Reduces a single code span to a `{ path, anchor? }` claim by running `toPath`, then `throughAliases`, then `claimsAPath`/`allowed` filters from `repo-references`.
- **`toPath`** — Normalizes a raw span: strips URL schemes, relative paths, HTTP routes, trailing line locators (`:42`), trailing slashes, and punctuation; splits off `#anchor`.
- **`isReal`** — Resolves a claim against the own-repo target set, the peer-repo target set (if available), and—when the claim carries an anchor and the target is a tracked `.md` page—against that page's heading slugs.
- **`headingSlugs` / `slugify`** — Extract all heading slugs from a markdown page, replicating VitePress's slug rules (lowercase, strip `*_*\`~``, spaces→hyphens) and honouring explicit `{#custom-id}`.
- **`anchorPageFor`** — Builds a suffix-to-full-path map so an anchor lookup can resolve a claim's spelling to the page whose headings settle it. Scoped to `docs/**` pages only.
- **`IGNORE_LINE`** (`<!-- doc-paths:ignore -->`) — Per-line opt-out for deliberately-absent path citations.
- **`MIN_PAGES` / `MIN_REFERENCES`** (90 / 300) — Guard floors: a sweep that sees fewer pages or references than these fails, preventing a silently-broken sweep from reporting a clean tree.

## Relationships

- **`scripts/docs/repo-references.ts`** — Supplies the entire path-resolution engine: `ALLOWED`, `allowed`, `NOT_A_PATH`, `trackedTargets`, `resolves`, `claimsAPath`, `readAliases`, `throughAliases`, and `gitEnvironment`. This file is the consumer; `repo-references.ts` is the library.
- **`scripts/modules-on-disk.ts`** — Exports `REPO_ROOT`, used here as `ROOT` for all filesystem and `git` operations.
- **`scripts/pairing/paired-frontend-path.ts`** — Exports `resolveFrontendPath` and `DEFAULT_FRONTEND_PATH`; used to locate the peer checkout and to derive `PEER_DIRECTORY` for cross-repo path resolution. Peer checks are skipped (not failed) when the peer is absent.

## Notes

- **Floors are a canary, not a target.** They exist to catch a sweep that silently reads zero pages. Raise them as docs grow; never lower them to make a run pass.
- **Slug matching is approximate.** VitePress de-duplicates repeated headings with `-1`, `-2` suffixes; this script does not, so a genuine collision will under-report rather than over-report.
- **`anchorPageFor` is intentionally scoped to `docs/**` pages.** A repo-wide `.md` glob would resolve anchors against `.2brain/llm-wiki/` generated mirrors, producing false positives.
- **Page enumeration uses `git ls-files docs`.** Untracked (new-but-unstaged) docs pages will not be swept.
- **The peer half is best-effort.** In a bare clone or detached worktree where the frontend checkout is missing, cross-repo claims are skipped rather than treated as failures.
