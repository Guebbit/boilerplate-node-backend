---
source: scripts/docs/repo-references.ts
sha256: 55113b0dbd09ce29300073feb36afc5fb0bc785525119490e6206e39092f8a7f
generated_at: 2026-09-27T13:56:32.135987+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/repo-references.ts

## Purpose

Shared path-validation primitives that let two different checkers — `check-references.ts` (markdown doc pages) and `comment-links.ts` (source-code comments) — agree on whether a cited path actually exists in this repo. Each caller still applies its own resolution policy (VitePress routing, paired-repo lookup, etc.) on top of the primitives defined here, so the "what counts as a real path" question has exactly one answer.

## Key elements

- **`ROOT`** — repo root, resolved two levels up from `scripts/docs/`.
- **`ALLOWED`** — array of `{ prefix, reason }` entries for paths that legitimately are absent in a clean checkout (generated files, build output, throwaway dirs). Each entry must carry a justification.
- **`allowed(token)`** — prefix-matches a token against `ALLOWED` (directory itself or anything under it).
- **`FILENAME`** — anchored regex for a valid filename (non-empty stem + known extension).
- **`NOT_A_PATH`** — regex of characters (whitespace, quotes, `<…>`, `…`, etc.) that mark a span as prose, a glob, a type, or a command rather than a real path.
- **`trackedTargets(root)`** — runs `git ls-files` and returns two `Set<string>`s: every path *tail* (file and intermediate directory) and the set of top-level segment names. Precomputed for O(1) lookup.
- **`SPELLINGS`** — list of extension/index suffixes (`'', '.ts', '/index.ts', …`) tried when resolving an extensionless module-specifier token.
- **`resolves(targets, token)`** — true if any spelling of the token is a tracked target.
- **`claimsAPath(roots, token)`** — true if the token's last segment is a valid filename *or* its first segment is a real root-level directory. Prevents false positives from MIME types, lint-rule names, `try/catch`, etc.
- **`readAliases()`** — parses `tsconfig.json` (stripping JSONC comments first) and returns the `paths` table as `{ prefix, target }[]`.
- **`throughAliases(aliases, token)`** — rewrites a `@alias/…` token to its concrete path; returns `undefined` for unclaimed `@scope/name` tokens (i.e. npm packages).
- **`gitEnvironment`** — re-exported from `../git-base` for callers that need it alongside the other primitives.

## Relationships

- **`scripts/docs/check-references.ts`** — primary consumer; imports the primitives (or re-exports them) and layers its markdown-specific resolution policies on top.
- **`scripts/eslint/comment-links.ts`** — secondary consumer; imports the same primitives for its `.ts`/`.tsx` comment-link checking, with a different set of resolution rules.
- **`scripts/git-base.ts`** — provides `gitEnvironment`, which this module imports and re-exports so callers can `import { gitEnvironment }` from here.
- **`tests/unit/scripts/docs/repo-references.test.ts`** — unit tests exercising the exported predicates and helpers.

## Notes

- `ALLOWED` is explicitly documented as "an argument, not a mute button": adding an entry without a `reason` defeats the purpose.
- `trackedTargets` builds a `Set` rather than using `endsWith` per query — a sweep asks thousands of questions against thousands of files, and the set makes each lookup a single hash hit.
- `readAliases` strips `//` comments before `JSON.parse` because `tsconfig.json` is JSONC; a naive `JSON.parse` on the raw file throws.
- `claimsAPath` tests `FILENAME` against the **last** segment only, so a suffix convention like `.visual.cy.ts` embedded in a longer token is not misread as a filename.
- The root-segment set in `claimsAPath` is read from the actual tree (via `trackedTargets`), not hardcoded — adding a new top-level directory requires no change here.
- The two callers intentionally disagree on edge-case policies (e.g. `./relative` vs. `boilerplate-vue-frontend/…`); those policies live in each caller, not in this file.
