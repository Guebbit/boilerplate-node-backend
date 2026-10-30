---
source: scripts/docs/repo-references.ts
sha256: ef8d5eee3db3fec35bcb4312d8807b779719cd27d2590259a224c0fccaa43c1f
generated_at: 2026-10-29T01:36:36.939167+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/repo-references.ts

## Purpose

Shared path-resolution primitives that let two independent checkers agree on what counts as a real path in this repo. `check-references.ts` (markdown docs) and `comment-links.ts` (source comments) each layer their own routing policy on top of the functions here, rather than each maintaining its own opinion of what exists on disk.

## Key elements

- **`ALLOWED`** — array of `{ prefix, reason }` entries for paths that legitimately do not exist in a clean checkout (generated files, build output, npm package names, etc.). Each entry carries a written justification.
- **`allowed(token)`** — returns true if a token matches any `ALLOWED` prefix (handles trailing-slash normalization).
- **`NOT_A_PATH`** — regex of characters (whitespace, quotes, angle brackets, ellipsis, etc.) that signal a token is prose, a glob, a type, or a command rather than a cited path.
- **`trackedTargets(root)`** — runs `git ls-files`, then builds two `Set<string>`s: `targets` (every tail of every tracked file *and* every intermediate directory) and `roots` (top-level segments). Precomputed for O(1) lookup across thousands of token × spelling combinations.
- **`resolves(targets, token)`** — tests whether any of the `SPELLINGS` (`.ts`, `.tsx`, `/index.ts`, bare, etc.) appended to the token is a member of `targets`.
- **`claimsAPath(roots, token)`** — decides if a token is even *claiming* a repo path: the last segment must match the `FILENAME` regex **or** the first segment must be a tracked root directory. Prevents false positives on MIME types, container images, lint rules, and language constructs.
- **`readAliases()`** — parses `tsconfig.json` (stripping JSONC comments) and returns the `paths` table as `{ prefix, target }[]`.
- **`throughAliases(aliases, token)`** — rewrites an `@alias/…` token to the concrete path it names; returns `undefined` for unclaimed `@scope/name` tokens (i.e. npm packages).
- **Re-export of `gitEnvironment`** — convenience pass-through from `../git-base` so callers need a single import.

## Relationships

- **`scripts/docs/check-references.ts`** — primary consumer. Imports `allowed`, `trackedTargets`, `resolves`, `claimsAPath`, `NOT_A_PATH`, `readAliases`, `throughAliases` and adds VitePress routing and paired-repo resolution on top.
- **`scripts/eslint/comment-links.ts`** — second consumer. Imports the same primitives and applies them to `.ts`/`.tsx` source comments, where VitePress routing and paired-repo rules do not apply.
- **`scripts/git-base.ts`** — provides `gitEnvironment()` (used for `git ls-files` env) and is re-exported for caller convenience.
- **`scripts/modules-on-disk.ts`** — supplies `REPO_ROOT` used by `readAliases()` to locate `tsconfig.json`.
- **`tests/unit/scripts/docs/repo-references.test.ts`** — unit tests for every exported function in this module.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — exercises the mutation-sweep CI workflow that invokes `check-references.ts`, indirectly exercising the allowlist entries for Stryker artifacts (`mutation.json`, `stryker-incremental.json`, `summary.md`).

## Notes

- The `ALLOWED` list is described in-code as "an argument, not a mute button." Adding an entry without a clear reason is a code-smell signal; a path with no legitimate reason to be absent should surface as a finding.
- `trackedTargets` filters out `.2brain/` mirror pages to prevent a stale `.md` mirror from vouching for a source file that no longer exists.
- `readAliases` manually strips `//`-style comments before `JSON.parse` because `tsconfig.json` is JSONC; a naive `JSON.parse` would throw.
- `claimsAPath` tests the filename regex only against the **last** segment of the token, so a convention suffix like `.visual.cy.ts` is not mistaken for a real file name merely because a matching file sits inside a longer string.
- The two callers intentionally diverge: markdown pages resolve `./relative` via VitePress routing and bare `boilerplate-vue-frontend/…` via the paired repo; source comments do neither. Those policies live in the callers, not here.
