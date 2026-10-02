---
source: scripts/docs/repo-references.ts
sha256: 2d491d0d18f6ab948a73c068d10aa8bd7a15643a6a69aa12cef13158bc6e1107
generated_at: 2026-10-01T12:31:24.475017+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/repo-references.ts

## Purpose

Shared primitives for verifying that a path cited in a comment or doc page actually exists in the repo. It centralises the "is this a real path?" and "does this path resolve?" questions so that `check-references.ts` (markdown pages) and `comment-links.ts` (TS source comments) agree on what counts as a valid citation without duplicating the logic. Each caller still applies its own resolution policy (VitePress routing, paired-repo tokens, etc.) on top of these primitives.

## Key elements

- **`ROOT`** — Repo root, computed two levels up from `scripts/docs/`.
- **`ALLOWED`** — Array of `{ prefix, reason }` entries for paths that legitimately don't exist in a clean checkout (generated files, build output, npm packages cited by name, etc.).
- **`allowed(token)`** — Prefix-matches a token against `ALLOWED`; matches the directory itself or anything under it.
- **`FILENAME`** — Regex for a plausible filename (non-empty stem + known extension). Used anchored on the *last* path segment so suffix conventions like `.visual.cy.ts` are not mistaken for a file.
- **`NOT_A_PATH`** — Regex of characters (whitespace, quotes, glob symbols, `<…>`, `…`) that mark a span as prose/type/command rather than a literal path.
- **`trackedTargets(root)`** — Runs `git ls-files` and precomputes two `Set<string>`s: every tail of every tracked file path (for O(1) resolution lookups) and the set of top-level directory/file names at the repo root. Includes intermediate directory paths as valid targets.
- **`SPELLINGS`** — Array of extension suffixes (including `/index.ts`, `/index.js`) used to resolve extensionless module-specifier citations.
- **`resolves(targets, token)`** — Checks whether any spelling of `token` is a member of the precomputed `targets` set.
- **`claimsAPath(roots, token)`** — Decides whether a token is asserting a path *in this repo* (ends in a real filename, or its first segment is a known root-level entry) as opposed to a MIME type, container image, or language feature.
- **`readAliases()`** — Reads `tsconfig.json` (stripping JSONC comments) and returns path-alias mappings (`@modules/` → `src/modules/`).
- **`throughAliases(aliases, token)`** — Rewrites an `@alias/…` token to its concrete path, or returns `undefined` for unclaimed `@scope/name` (i.e. npm packages).
- **`gitEnvironment`** — Re-exported from `scripts/git-base.ts` for convenience.

## Relationships

- **`scripts/docs/check-references.ts`** — Primary consumer; applies VitePress routing and paired-repo token policies on top of the primitives here to validate every `docs/*.md` page.
- **`scripts/eslint/comment-links.ts`** — Secondary consumer; uses the same primitives to validate `.ts`/`.tsx` source comments.
- **`scripts/git-base.ts`** — Source of `gitEnvironment()`, imported for the correct `git` environment (e.g. `GIT_DIR`) when invoking `git ls-files`.
- **`tests/unit/scripts/docs/repo-references.test.ts`** — Unit tests exercising the exported functions.

## Notes

- `ALLOWED` entries are described as "an argument, not a mute button": every entry must carry a `reason`, and a path with no reason to be absent should surface as a finding rather than being silently exempted.
- `trackedTargets` uses `Set<string>` lookups (one hash per question) instead of `endsWith` scans because a full sweep asks thousands of questions against thousands of files across a dozen candidate spellings.
- `readAliases` strips `//` comments before `JSON.parse` because `tsconfig.json` is JSONC.
- `claimsAPath` is deliberately *not* a simple "contains a slash" test; it requires either a real filename on the last segment or a first segment that actually sits at the repo root, so tokens like `text/event-stream` or `try/catch` are not false positives.
- The module docstring explicitly scopes the two callers' divergent policies: `./relative` → VitePress routing (markdown), `boilerplate-vue-frontend/…` → paired repo (markdown). Those stay with the callers, not here.
