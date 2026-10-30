---
source: scripts/docs/check-references.ts
sha256: 1ae019571262dfe456e0171aae83a8f6353da5b7e3d9d239d942880887af4040
generated_at: 2026-10-29T01:33:33.068750+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/check-references.ts

## Purpose

Validates that file paths cited in inline code spans within `docs/**/*.md` actually exist in the repository (or the paired frontend repo), and that any `#anchor` suffix points to a real heading. Complements `docs:build` (which catches dead links) by catching dead *facts*—a docs claim that references a file that no longer exists.

## Key elements

- **`run()`** — Entry point. Collects tracked targets, builds the alias/root context, sweeps every `docs/**/*.md` page, enforces floor thresholds, prints findings, and sets `process.exitCode`.
- **`scanPage()`** — Scans one markdown page line-by-line for `` `code` `` spans, classifies each via `tokenOf`, and checks it via `isReal`. Honors the per-line `IGNORE_LINE` opt-out.
- **`tokenOf()`** — Reduces a raw code span to a `{ path, anchor? }` claim using `toPath`, alias resolution, and the `ALLOWED`/`claimsAPath` filters from `repo-references`.
- **`toPath()`** — Normalizes a span into a repo-relative path plus optional `#anchor`. Strips `:line`/`:function` locators, trailing slashes/punctuation. Rejects URLs, relative (`./`, `../`) paths, and absolute HTTP routes.
- **`isReal()`** — Resolves the claim against own-repo targets or (if prefixed with `PEER_DIRECTORY/`) peer-repo targets. For anchored claims on own-repo `.md` pages, verifies the slug exists via `anchorsOf`.
- **`headingSlugs()` / `slugify()`** — Extract all heading slugs from a page using VitePress's slugification rules (lowercase, strip formatting chars, spaces→hyphens). Also picks up explicit `{#custom-id}` suffixes.
- **`anchorPageFor()`** — Builds a suffix→full-path map over the `docs/**` pages so an anchor lookup can resolve a claim's spelling to the correct page. Scoped to `docs/` to avoid matching generated `.2brain` summaries.
- **`MIN_PAGES` (90) / `MIN_REFERENCES` (300)** — Floor thresholds. If the sweep sees fewer pages or references than these, it fails rather than silently reporting a clean tree.
- **`IGNORE_LINE`** (`<!-- doc-paths:ignore -->`) — Per-line opt-out marker for claims that intentionally name an absent path.

## Relationships

- **`scripts/docs/repo-references.ts`** — Supplies the core claiming/resolving primitives: `trackedTargets`, `resolves`, `claimsAPath`, `readAliases`, `throughAliases`, `ALLOWED`, `allowed`, `NOT_A_PATH`, and `gitEnvironment`. This file is the consumer; `repo-references` is the shared library.
- **`scripts/modules-on-disk.ts`** — Provides `REPO_ROOT` (imported as `ROOT`), the canonical filesystem root for all path operations.
- **`scripts/pairing/paired-frontend-path.ts`** — Provides `resolveFrontendPath()` (to locate the peer repo at runtime) and `DEFAULT_FRONTEND_PATH` (to derive `PEER_DIRECTORY`, the directory name used as a prose prefix in cross-repo citations).
- **`scripts/git-base.ts`** — Indirect dependency; `gitEnvironment()` from `repo-references` likely delegates to git-base for environment setup, but no direct import exists in this file.

## Notes

- **Floors are a canary, not a limit.** `MIN_PAGES` and `MIN_REFERENCES` are deliberately set just below the current tree so normal edits never trip them, but a sweep that silently reads zero pages will. The comment explicitly says: raise when docs grow; *never* lower to make a run pass.
- **Slug matching is approximate on purpose.** VitePress de-duplicates repeated headings with `-1`/`-2` suffixes; `slugify` does not, so a genuine collision *under*-reports (misses a finding) rather than *over*-reports (false positive).
- **Peer-repo checks degrade gracefully.** If the peer checkout is absent (bare clone, worktree), cross-repo claims are skipped entirely rather than failing.
- **Anchor checks are own-repo `.md` only.** A claim like `some-file.ts#function` will have its file-existence checked, but the anchor half is verified only when the target is a `docs/` markdown page with readable headings.
- **Slug cache prevents re-parsing.** Heavily-linked pages (glossary, module index) would otherwise have their headings re-parsed once per citation; `slugsCache` reads each page at most once.
- **`anchorPageFor` is intentionally narrow.** It maps only `docs/**` pages, not every `.md` in the repo, to prevent a claim like `orders/repository.ts#findByIdScoped` from being resolved against an unrelated generated `.2brain/llm-wiki/` summary.
