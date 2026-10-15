---
source: scripts/docs/check-references.ts
sha256: 25a6146314f226071f5baced54b93488ab6bf82547423786fd179805c26667f4
generated_at: 2026-10-15T09:39:35.652368+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/check-references.ts

## Purpose

A CLI sweep (`npm run check:docs-references`) that extracts every file path cited in inline code spans across `docs/**/*.md` and verifies it resolves to a real file or directory in the repository (or the paired frontend repo). It catches the class of documentation rot where a page names a path that no longer exists — something `docs:build` (link checker) and `lint:openapi` (route checker) do not cover.

## Key elements

- **`run()`** — Entry point. Reads tsconfig aliases, tracks targets for own and peer repos, enumerates `docs/**/*.md` via `git ls-files`, scans each page, aggregates findings, and enforces floor thresholds.
- **`scanPage(markdown, context)`** — Iterates a page's lines, skips lines carrying `<!-- doc-paths:ignore -->`, extracts inline code spans (`` `…` ``), and classifies each as a valid token or a finding.
- **`toPath(span)`** — Normalizes a raw code span into `{ path, anchor? }`; rejects URLs, `./`-relative tokens, leading-`/` HTTP routes, and non-path tokens via `NOT_A_PATH`.
- **`tokenOf(span, aliases, roots)`** — Applies alias rewriting (`@modules/…` → real prefix) and filters out allowed/synthetic paths before returning a `Claim`.
- **`isReal(claim, own, peer, anchorsOf)`** — Resolution check: suffix-matches against tracked targets (own or peer repo), then validates `#anchor` against the target page's heading slugs.
- **`headingSlugs(markdown)` / `slugify(heading)`** — Reproduces VitePress heading-slug generation (lowercase, strip formatting, spaces→hyphens) plus explicit `{#custom-id}` ids, used to verify anchor claims.
- **`anchorPageFor(pages)`** — Builds a suffix-tail → actual page-path map so an anchor lookup can resolve `orders/repository.ts` to `docs/…/orders/repository.md`.
- **`PEER_DIRECTORY`** — `path.basename(DEFAULT_FRONTEND_PATH)`; used to detect and route cross-repo path citations.
- **`MIN_PAGES` (90) / `MIN_REFERENCES` (300)** — Floor guards; the script exits non-zero if the sweep sees fewer, preventing a silent "zero pages → clean tree" false pass.
- **`IGNORE_LINE`** — `<!-- doc-paths:ignore -->`; line-level opt-out for prose that deliberately names an absent path (rename tables, deprecation notes).

## Relationships

- **`scripts/docs/repo-references.ts`** — Primary logic library: provides `trackedTargets`, `resolves`, `claimsAPath`, `allowed`, `NOT_A_PATH`, `readAliases`, `throughAliases`, `gitEnvironment`, and the `ALLOWED` list of synthetic/generated prefixes. This file is the thin CLI shell over that library.
- **`scripts/modules-on-disk.ts`** — Exports `REPO_ROOT`, the canonical repo root path used to join file reads and to scope `git ls-files`.
- **`scripts/pairing/paired-frontend-path.ts`** — Exports `resolveFrontendPath()` and `DEFAULT_FRONTEND_PATH`; used to locate the paired frontend checkout for cross-repo path resolution and to derive `PEER_DIRECTORY`.

## Notes

- The sweep is intentionally narrow: **inline code spans only** (fenced blocks are code samples, not path claims), **suffix resolution** (so `orders/model.ts` matches `src/modules/orders/model.ts`), and **own-repo anchors only** (peer-repo heading text is not parsed).
- Anchor slug matching is approximate: VitePress de-duplicates repeated headings with `-1`/`-2` suffixes; this script does not, so a genuine collision under-reports rather than over-reports.
- The paired-repo half is **skipped, not failed**, when the peer has no `.git` (bare clone, worktree) — `peerTargets` stays `undefined` and `isReal` returns `true` for peer paths.
- The floors (`MIN_PAGES`, `MIN_REFERENCES`) are deliberately set just below current values. The comment explicitly warns: never lower them to make a run pass; raise them as docs grow.
- The `anchorsOf` callback caches heading slugs per page (one `readFileSync` per cited page) to avoid reparsing a heavily-linked page dozens of times in a single sweep.
