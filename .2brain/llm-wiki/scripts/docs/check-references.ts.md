---
source: scripts/docs/check-references.ts
sha256: bbc00101b0c27b52dceaf19aaabf6eca75921dcfd96c6422142fc17fd63baf7d
generated_at: 2026-09-27T13:54:39.742883+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/check-references.ts

## Purpose

Validates that every file path named in inline code spans (backtick-delimited) across `docs/**/*.md` pages actually exists in the repo tree or the paired frontend tree. It catches "dead facts" — prose that references a path that has been renamed or removed — which `docs:build` (link checking) does not cover. Runs via `npm run check:docs-references`.

## Key elements

- **`run()`** — Entry point. Enumerates tracked `.md` pages under `docs/`, scans each, enforces floor guards (`MIN_PAGES`, `MIN_REFERENCES`), and exits non-zero on findings.
- **`scanPage(markdown, context)`** — Iterates lines, extracts inline code spans, classifies each as a path claim or not, and collects findings. Skips lines containing the `IGNORE_LINE` marker.
- **`tokenOf(span, aliases, roots)`** — Reduces one code span to a `{ path, anchor? }` claim. Resolves `@`-prefixed tokens through tsconfig aliases; returns `undefined` for URLs, `./`-relative paths, HTTP routes, and non-path tokens.
- **`toPath(span)`** — Strips trailing `:line`/`:function` locators, trailing slashes, and splits off a `#anchor`. Returns `undefined` for tokens that are not path claims.
- **`isReal(claim, own, peer, anchorsOf)`** — Resolves the claim against the tracked target set. Cross-repo claims (starting with `PEER_DIRECTORY/`) resolve against the peer tree. Anchor claims are checked only for pages in this repo that are `.md` files.
- **`slugify(heading)` / `headingSlugs(markdown)`** — Produce the set of anchor slugs a page answers to, using VitePress's slugification rules (approximate: no `-1`/`-2` de-dup).
- **`anchorPageFor(pages)`** — Builds a suffix→page map so an anchor lookup can go from a claimed spelling to the actual page file.
- **`PEER_DIRECTORY`** — `path.basename(DEFAULT_FRONTEND_PATH)`; the directory name that identifies cross-repo citations.
- **`MIN_PAGES` / `MIN_REFERENCES`** — Floor guards (90 / 300). If the sweep sees fewer than these, it fails loudly rather than reporting a false clean.
- **`IGNORE_LINE`** (`<!-- doc-paths:ignore -->`) — Per-line opt-out for prose that deliberately names an absent path.

## Relationships

- **`scripts/docs/repo-references.ts`** — Primary dependency. Supplies the path-resolution primitives: `trackedTargets`, `resolves`, `claimsAPath`, `allowed`, `NOT_A_PATH`, `readAliases`, `throughAliases`, `gitEnvironment`, `ROOT`, `ALLOWED`.
- **`scripts/pairing/paired-frontend-path.ts`** — Provides `resolveFrontendPath()` and `DEFAULT_FRONTEND_PATH` so cross-repo path claims can be resolved against the paired frontend checkout (or skipped if absent).
- **`scripts/git-base.ts`** — Transitive dependency (reached through `repo-references.ts`); supplies the git command helpers used to enumerate tracked files.

## Notes

- Resolution is **suffix-based**: `orders/model.ts` matches `src/modules/orders/model.ts`. Pages do not need to spell the full root-relative path.
- The slug approximation intentionally **under-reports** anchor collisions (VitePress's `-1`/`-2` suffix de-dup is not replicated). A repeated heading will not cause a false positive, but a genuine duplicate-anchor mismatch may slip through.
- When no peer frontend checkout is present (bare clone, worktree), cross-repo claims are **skipped**, not failed. The script degrades gracefully.
- `docs:build` already rejects dead *links* between two doc pages and dead `./`-relative references. This script is complementary: it catches path *mentions* in prose/code-spans that have no link semantics.
- Floor guards must be **raised** as the doc set grows; never lower them to make a failing run pass.
