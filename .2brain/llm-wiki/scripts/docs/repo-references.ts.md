---
source: scripts/docs/repo-references.ts
sha256: 9bef6debcfcec528e8cd667fa7cb7a8cf38f507e780f671a0feeace46de2e8b6
generated_at: 2026-10-15T09:41:35.506077+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/repo-references.ts

## Purpose

Shared path-existence primitives that answer one question: *does the path a comment or doc page cites still exist in this repo?* It sits between `check-references.ts` (markdown pages) and `comment-links.ts` (source comments) so the two checkers agree on what counts as a real path instead of each growing its own opinion. The higher-level resolution policies (VitePress-relative tokens, paired-repo tokens) intentionally stay in the callers; this file provides the lower-level "is it a path?", "does it resolve?", and "rewrite the alias" machinery.

## Key elements

- **`ALLOWED`** — Array of `{ prefix, reason }` entries for paths that legitimately do not exist in a clean checkout (generated files, `node_modules/`, `.env`, build output, etc.). Each entry must carry a reason; it is "an argument, not a mute button."
- **`allowed(token)`** — Prefix-matches a token against `ALLOWED`, treating a directory and its children as the same claim.
- **`FILENAME`** (regex) — Matches a valid filename: non-empty stem + a known extension (`.ts`, `.vue`, `.json`, …). A bare `.ts` or a dot-led suffix convention like `.visual.cy.ts` does not match.
- **`NOT_A_PATH`** (regex) — Characters that mark a span as prose, a glob, a type, or a command (`whitespace`, `*`, `<…>`, `…`, backticks, etc.), so those spans are never treated as path citations.
- **`trackedTargets(root)`** — Runs `git ls-files`, then builds two `Set`s: `targets` (every tail of every tracked path plus every directory tail) and `roots` (top-level entries). Excludes `.2brain/` mirrors. Precomputed for O(1) lookup instead of per-token `endsWith` scans.
- **`SPELLINGS`** — Ordered list of extension suffixes (`''`, `.ts`, `/index.ts`, …) tried when resolving an extensionless token.
- **`resolves(targets, token)`** — Returns true if any spelling of the token is in the `targets` set.
- **`claimsAPath(roots, token)`** — Two-pronged test that a token is actually claiming a repo path: its last segment passes `FILENAME`, **or** its first segment is a real top-level directory. Prevents false positives like `text/event-stream` or `try/catch`.
- **`readAliases()`** — Reads `tsconfig.json` (stripping JSONC comments first), extracts `compilerOptions.paths`, and normalises them into `{ prefix, target }` pairs.
- **`throughAliases(aliases, token)`** — Rewrites an `@alias/…` token to its concrete path, or returns `undefined` for unclaimed `@scope/name` tokens (npm packages). Wildcard aliases match by prefix; bare aliases must match exactly.
- **`gitEnvironment`** — Re-exported from `../git-base` for convenience of callers.

## Relationships

- **`scripts/docs/check-references.ts`** — Primary consumer. Uses `allowed`, `trackedTargets`, `resolves`, `claimsAPath`, `readAliases`, and `throughAliases` to validate path citations in every `docs/*.md` page. Adds its own VitePress-routing and paired-repo resolution on top.
- **`scripts/eslint/comment-links.ts`** — Primary consumer. Uses the same primitives to validate path citations in `.ts`/`.tsx` source comments. Adds its own ESLint-plugin integration on top.
- **`scripts/git-base.ts`** — Provides `gitEnvironment()`, imported here and re-exported so both callers get a consistent `git` environment.
- **`scripts/modules-on-disk.ts`** — Provides `REPO_ROOT` (aliased as `ROOT`), used as the base path in `readAliases()`.
- **`tests/unit/scripts/docs/repo-references.test.ts`** — Unit tests exercising the exports of this module.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Likely touches `ALLOWED` or related path logic indirectly through the mutation/CI pipeline that this repo's tooling depends on.

## Notes

- **`.2brain/` exclusion:** `trackedTargets` deliberately filters out `.2brain/` mirror files. Without this, a stale `.md` mirror could make a deleted source file appear to still exist.
- **JSONC in `tsconfig.json`:** `readAliases` strips `//` comments line-by-line before `JSON.parse`, because `tsconfig.json` is JSONC and `JSON.parse` rejects comments.
- **`ALLOWED` is prefix-based, not exact-match:** A page citing `tmp/reports` and a page citing `tmp/reports/mutation/` both match the `tmp/` entry. When adding a new entry, choose the narrowest prefix that covers the intended set.
- **`claimsAPath` second prong is data-driven:** The "first segment is in `roots`" check reads the actual tree rather than a hardcoded list, so adding a new top-level directory requires no edit to this file.
- **`NOT_A_PATH` includes `…` and `<>`:** These are deliberate — an ellipsis means the author is illustrating a shape, and `<placeholder>` means "this segment varies." Neither is a real path citation.
