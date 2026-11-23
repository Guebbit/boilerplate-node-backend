---
source: scripts/docs/repo-references.ts
generated_at: 2026-11-22T02:05:12.151491+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/docs/repo-references.ts

## Purpose
Shared machinery for deciding whether a path cited in a comment still exists in the repo. It backs both `check-references.ts` (every `docs/*.md` page) and the `.ts`/`.tsx` half of the `local/comment-links` lint rule, so the two checkers agree on what counts as a real path. Caller-specific policies (VitePress `./relative` routing, paired-repo `boilerplate-vue-frontend/...` tokens) stay with the callers.

## Key elements
- `ALLOWED` — prefix allowlist of paths legitimately absent from a clean checkout (`tmp/`, `node_modules/`, `dist/`, generated files, `.env`, VitePress build/cache dirs, etc.), each entry carrying a `reason`.
- `allowed(token)` — true if the token ends in one of two generated-file suffixes or matches an `ALLOWED` entry. It matches the directory itself, anything under it, and any directory leading to it.
- `NOT_A_PATH` — regex for characters that mark a span as prose, glob, type, command, placeholder (`<>`) or elided (`…`) rather than one real path.
- `trackedTargets(root)` — runs `git ls-files` and returns `{ targets, roots }`. `targets` holds every tail of every tracked path and of every directory on the way to one. `roots` holds the real top-level entries. `.2brain/` is excluded.
- `resolves(targets, token)` — true if the token, with any of a fixed list of extension or index spellings appended (the bare token, `.ts`, `.tsx`, `.js`, `.vue`, `.json`, `.yaml`, `.yml`, `.md`, plus `index.ts`/`index.js` under the token as a directory), is in `targets`.
- `claimsAPath(roots, token)` — decides whether a token is claiming a path in this repo. It qualifies if the last segment is a real filename (known extension, non-empty non-dot-led stem) or the first segment is an actual root entry.
- `readAliases()` — reads `compilerOptions.paths` from the root `tsconfig.json` (stripping `//` comment lines first) into `{ prefix, target }` pairs.
- `throughAliases(aliases, token)` — rewrites an `@alias/...` token to its real path. Non-`@` tokens pass through unchanged, and an unclaimed `@scope/name` returns `undefined`.
- `gitEnvironment` — re-exported from `../git-base`.

## Relationships
- `check-references.ts` and `scripts/eslint/comment-links.ts` are the two consumers. Each layers its own policy on top of these primitives.
- `../git-base` supplies `gitEnvironment()`, which is passed as `env` to `git ls-files` and is also re-exported.
- `../modules-on-disk` supplies `REPO_ROOT` (imported as `ROOT`), used to locate the root `tsconfig.json`.
- `tests/unit/scripts/docs/repo-references.test.ts` is the unit test for this file. `code-citations.test.ts` and `waves.test.ts` are related tests in the graph.

## Notes
- `trackedTargets` precomputes tail sets so each lookup is a hash check instead of many `endsWith` comparisons. A sweep makes thousands of queries against thousands of files.
- `roots` is built from the file list, not from `targets`. Targets hold tails, so a tracked file nested under a directory (such as `model.ts` inside an `orders` directory) would otherwise make that nested directory look top-level.
- `.2brain/` is filtered out because its mirrored `<path>.md` pages would otherwise vouch for source files that no longer exist.
- A bare slash does not make a path (`text/event-stream`, `try/catch`). The top-level-directory check reads the tree, so new top-level directories need no edit here.
- The filename pattern rejects dot-led suffix conventions (such as a visual-test suffix like `.visual.cy.ts`-style tokens), since the last segment must have a non-empty, non-dot-led stem.
- `throughAliases` requires a wildcard alias, which ends in `/`, to prefix-match, and a bare alias to match whole. This stops `@types` from claiming `@typescript-eslint/parser`.
- `ALLOWED` entries are meant to be justified; a path with no reason to be absent belongs in the findings.
