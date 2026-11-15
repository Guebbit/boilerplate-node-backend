---
source: scripts/docs/repo-references.ts
sha256: 703faf56cc0fb935bc580c6afea703998324720825f7ac037c32b26e5d27175c
generated_at: 2026-11-14T17:34:58.926998+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/repo-references.ts

## Purpose

Shared path-resolution primitives that answer one question: *does a path cited in a doc page or source comment still exist in this repo?* Extracted so that `check-references.ts` (markdown docs) and `comment-links.ts` (TypeScript comments) agree on what counts as a real path, while each caller keeps its own policy for relative-URL and bare-token resolution.

## Key elements

- **`ALLOWED`** — array of `{ prefix, reason }` entries for paths that are legitimately absent in a clean checkout (generated files, `node_modules`, build output, env files, etc.).
- **`allowed(token)`** — returns true if the token is covered by `ALLOWED` or ends in a known generated suffix (`.generated.ts`, `asyncapi.public.yaml`).
- **`NOT_A_PATH`** — regex of characters (whitespace, quotes, brackets, ellipsis, angle brackets, etc.) that mark a span as prose, glob, type, or command rather than a real path.
- **`trackedTargets(root)`** — runs `git ls-files`, then builds two `Set<string>`s: `targets` (every path tail and every directory on the way) and `roots` (top-level entries). Excludes `.2brain/` mirrors.
- **`resolves(targets, token)`** — checks whether the token (or the token + any of the `SPELLINGS` extensions/index suffixes) appears in the `targets` set.
- **`claimsAPath(roots, token)`** — gates whether a token is even a repo-path claim: last segment must match `FILENAME` *or* first segment must be a known root entry. Prevents false positives on MIME types, container image names, lint rules, etc.
- **`readAliases()`** — reads and parses `tsconfig.json` (strips JSONC comments first) and returns the `compilerOptions.paths` table as `{ prefix, target }` pairs.
- **`throughAliases(aliases, token)`** — rewrites an `@alias/…` token to its concrete path; returns `undefined` for unclaimed `@scope/name` (i.e. npm packages). Distinguishes wildcard (`@modules/*`) from bare (`@types`) aliases.
- **`FILENAME`**, **`SPELLINGS`**, **`GENERATED_SUFFIXES`** — module-private constants used by the functions above.
- **Re-export: `gitEnvironment`** — re-exported from `../git-base` for callers that import it from here.

## Relationships

- **`scripts/docs/check-references.ts`** — primary consumer; builds its markdown-page resolution policy (VitePress routing, paired-repo bare tokens) on top of `allowed`, `trackedTargets`, `resolves`, `claimsAPath`, `readAliases`, and `throughAliases`.
- **`scripts/eslint/comment-links.ts`** — second consumer; applies the same primitives to `.ts`/`.tsx` source comments with its own token-extraction rules.
- **`scripts/git-base.ts`** — provides `gitEnvironment()` (imported and re-exported here); the env map is passed to `git ls-files` inside `trackedTargets`.
- **`scripts/modules-on-disk.ts`** — supplies the `REPO_ROOT` constant used by `readAliases` to locate the project's `tsconfig.json` at runtime.
- **`tests/unit/scripts/docs/repo-references.test.ts`** — unit tests exercising `allowed`, `trackedTargets`, `resolves`, `claimsAPath`, `readAliases`, and `throughAliases`.
- **`tests/unit/scripts/docs/code-citations.test.ts`** — integration-level tests for the citation pipeline that builds on this module.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — exercises mutation-CI wave logic that references paths validated through this module's allowlist.

## Notes

- Each `ALLOWED` entry is "an argument, not a mute button": a path with no legitimate reason to be absent belongs in findings, not here.
- `trackedTargets` is a precomputed `Set` (hash lookup) rather than per-token `endsWith` scans, because a full sweep asks thousands of questions against thousands of files × ~10 candidate spellings.
- `readAliases` strips `//` comments via regex before `JSON.parse` because `tsconfig.json` is JSONC.
- `throughAliases` keeps a trailing slash on wildcard prefixes (`@modules/`) so `@modules/foo` matches but `@modulesX` does not; bare aliases (`@types`) require an exact token match to avoid claiming `@typescript-eslint/parser`.
- The `FILENAME` regex is applied to the **last** path segment only, so a suffix convention like `.visual.cy.ts` embedded in a longer token is not mistaken for a filename.
- `.2brain/` mirror pages (each source file mirrored as `<path>.md`) are excluded from `trackedTargets` to prevent a stale mirror from vouching for a deleted source file.
