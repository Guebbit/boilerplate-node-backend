---
source: scripts/docs/repo-references.ts
sha256: 3f374c05a9f208d65e3105c978d6d044235816f5b667a0952bde9718dcfe6049
generated_at: 2026-09-23T17:26:24.317920+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/repo-references.ts

## Purpose

Shared path-resolution primitives so the two reference checkers — `check-references.ts` (markdown docs) and `comment-links.ts` (source comments) — agree on what counts as a real, in-repo path. Each caller keeps its own policy layer (VitePress routing, paired-repo tokens, etc.) on top of the primitives exported here.

## Key elements

- **`ROOT`** — repo root, resolved two levels up from `scripts/docs/`.
- **`ALLOWED`** — prefix-matched list of paths that legitimately don't exist in a clean checkout (generated files, `node_modules/`, `tmp/`, build output, etc.), each with a stated reason.
- **`allowed(token)`** — returns true if the token matches an `ALLOWED` entry (the directory itself _or_ anything beneath it).
- **`FILENAME`** — regex identifying a real filename (non-empty stem + known extension). Applied to the _last_ segment only, so suffix conventions like `.visual.cy.ts` are not misread as filenames.
- **`NOT_A_PATH`** — regex of characters (whitespace, quotes, globs, `…`, `<placeholder>`) that mark a span as prose, a glob, or a type rather than a concrete path.
- **`trackedTargets(root)`** — shells out to `git ls-files` and precomputes two `Set`s: `targets` (every tail of every tracked file _and_ every intermediate directory) and `roots` (top-level segments actually present at the repo root). Set lookup replaces what would otherwise be tens of millions of `endsWith` comparisons.
- **`SPELLINGS`** — ordered suffixes (`'', '.ts', '/index.ts', …`) tried when an extensionless token is resolved.
- **`resolves(targets, token)`** — true if any spelling of the token is a member of the `targets` set.
- **`claimsAPath(roots, token)`** — gatekeeper: true only if the last segment matches `FILENAME` **or** the first segment is a known root-level entry. Prevents MIME types, container images, lint rules, etc. from being treated as repo paths.
- **`readAliases()`** — parses `tsconfig.json` (stripping JSONC comments first) and returns `{ prefix, target }[]` for `paths` aliases.
- **`throughAliases(aliases, token)`** — rewrites an `@alias/…` token to its concrete path; returns `undefined` when no alias claims the token (e.g. an npm scope like `@typescript-eslint/…`).

## Relationships

- **`scripts/docs/check-references.ts`** — consumes `ROOT`, `ALLOWED`, `allowed`, `trackedTargets`, `resolves`, `claimsAPath`, `readAliases`, and `throughAliases` to validate path tokens in every `docs/*.md` page. Adds its own policy on top: `./relative` tokens resolve via VitePress routing, bare `boilerplate-vue-frontend/…` tokens resolve against the paired repo.
- **`scripts/eslint/comment-links.ts`** — consumes the same primitives to validate path tokens in `.ts`/`.tsx` source comments. Its policy layer is the ESLint rule wrapper; the "is this a real path?" question is delegated entirely to this module.

## Notes

- `ALLOWED` is deliberately an _argument_, not a mute button: every entry carries a `reason`, and a path with no reason to be absent should appear as a finding.
- `trackedTargets` includes intermediate directories (e.g. `src/infrastructure/`) as valid tails, so citing a directory name without a trailing file is still resolvable.
- `FILENAME` and `claimsAPath` are anchored on the **last** segment to avoid reading multi-part suffix conventions (`.visual.cy.ts`, `.test.tsx`) as filenames.
- `readAliases` manually strips `//` comment lines before `JSON.parse` because `tsconfig.json` is JSONC and the built-in parser rejects it.
- `throughAliases` distinguishes wildcard aliases (`@modules/*` → prefix match with trailing `/`) from bare aliases (`@types` → exact match) so that `@types` does not accidentally claim `@typescript-eslint/parser`.
