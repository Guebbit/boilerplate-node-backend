---
source: scripts/docs/repo-references.ts
sha256: cf698c7a58bd13f18de3630bb9e18f580eeb8b63edf83c39e1c4fa0210a68c7a
generated_at: 2026-11-08T02:49:50.847634+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/repo-references.ts

## Purpose

Shared path-resolution machinery that answers one question — "does a path cited in a comment or docs page actually exist in this repo?" — so that the two callers (`check-references.ts` for Markdown pages and `scripts/eslint/comment-links.ts` for source comments) agree on what counts as a real path instead of each maintaining its own allowlist and resolution logic. The callers keep their own token-extraction and repo-specific policies (VitePress routing, paired-repo tokens) on top of the primitives here.

## Key elements

- **`ALLOWED`** — Array of `{ prefix, reason }` entries for paths that legitimately do not exist in a clean checkout (generated files, `tmp/` artifacts, `node_modules/`, `.env`, build output, etc.). Each entry documents *why* the path is exempt.
- **`allowed(token)`** — Returns `true` if the token matches an `ALLOWED` prefix (directory or contents) or ends with one of the generated-file suffixes (`.generated.ts`, `asyncapi.public.yaml`).
- **`NOT_A_PATH`** — Regex of characters (`whitespace`, `! " ' ( ) * , < = > ? [ ] \` | } …`) that mark a span as prose, a glob, a type annotation, or a command rather than a literal path citation.
- **`trackedTargets(root)`** — Runs `git ls-files`, then builds two `Set<string>` values: `targets` (every suffix-tail of every tracked file and every intermediate directory) and `roots` (top-level entries at the repo root). Filters out `.2brain/` mirror pages. Returns `{ targets, roots }` for O(1) membership tests.
- **`resolves(targets, token)`** — Checks whether the token (or the token with one of the known file extensions or `/index.{ts,js}` appended) appears in the `targets` set.
- **`claimsAPath(roots, token)`** — Heuristic to decide if a token is even *claiming* a repo path: the last segment must match a filename pattern, or the first segment must be a known top-level directory. Prevents false positives on MIME types, container image names, lint rule IDs, and language constructs like `try/catch`.
- **`readAliases()`** — Reads `tsconfig.json` (stripping JSONC comments), extracts `compilerOptions.paths`, and returns `{ prefix, target }` pairs (e.g. `@modules/` → `src/modules/`).
- **`throughAliases(aliases, token)`** — Rewrites an `@alias/…` token to its concrete path, or returns `undefined` if no alias claims it (i.e. it's an npm package reference).
- **`gitEnvironment`** — Re-exported from `scripts/git-base.ts` so callers import it from this module.

## Relationships

- **`scripts/docs/check-references.ts`** — Primary consumer for Markdown docs pages. Uses `allowed`, `trackedTargets`, `resolves`, `claimsAPath`, `readAliases`, and `throughAliases` as building blocks; adds its own VitePress-routing and paired-repo token policies on top.
- **`scripts/eslint/comment-links.ts`** — Primary consumer for `.ts`/`.tsx` source comments. Consumes the same primitives; handles the TypeScript-specific half of path checking.
- **`scripts/git-base.ts`** — Provides `gitEnvironment()` (env vars for `git` subprocess calls) and `REPO_ROOT` via `scripts/modules-on-disk.ts`; both are imported here and re-exported.
- **`scripts/modules-on-disk.ts`** — Source of the `REPO_ROOT` constant used to locate `tsconfig.json` in `readAliases()`.
- **`tests/unit/scripts/docs/repo-references.test.ts`** — Unit tests for the exports in this file.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Likely exercises `ALLOWED` entries (e.g. `mutation.json`, `summary.md`, `stryker-incremental.json`) when verifying that CI wave scripts reference valid paths.

## Notes

- `ALLOWED` entries are *arguments*, not mute buttons — the doc comment explicitly states a path with no reason to be absent should surface as a finding.
- `trackedTargets` precomputes a `Set` of path tails specifically to avoid tens of millions of `endsWith` comparisons during a full sweep; do not replace with per-token string matching.
- `claimsAPath` is deliberately conservative: a bare slash (`try/catch`, `text/event-stream`) is *not* a path. Only a real filename in the last segment or a known top-level directory in the first segment qualifies.
- `readAliases` strips `//` comments line-by-line before `JSON.parse` because `tsconfig.json` is JSONC. The parsing is intentionally narrow (first array element of each `paths` entry).
- `throughAliases` distinguishes wildcard aliases (prefix match, keeps trailing slash) from bare aliases (exact match) to avoid `@types` swallowing `@typescript-eslint/parser`.
- The `.2brain/` directory is excluded from `trackedTargets` because it mirrors every source file as `<path>.md`, which would let a stale mirror page vouch for a deleted source file.
