---
source: scripts/docs/repo-references.ts
sha256: f09504067ef4222adb8611823505a885a62080533658a1c29c998bbd038762e9
generated_at: 2026-10-14T07:17:34.789836+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/repo-references.ts

## Purpose

Shared primitives for deciding whether a file path cited in documentation or source comments still exists in the repo. Extracted so that `check-references.ts` (markdown docs) and `comment-links.ts` (TypeScript comments) agree on what counts as a real path, while each caller keeps its own resolution policy (VitePress routing vs. bare repo paths).

## Key elements

- **`ROOT`** — Repo root, resolved two levels up from `scripts/docs/`.
- **`ALLOWED`** — Array of `{ prefix, reason }` entries for paths that legitimately absent in a clean checkout (generated files, build output, node_modules, etc.).
- **`allowed(token)`** — Prefix match against `ALLOWED`; matches the directory itself or anything beneath it.
- **`FILENAME`** — Regex: a non-empty stem + a known extension. Used to distinguish real filenames from dot-suffix conventions (e.g. `.visual.cy.ts`).
- **`NOT_A_PATH`** — Character set (whitespace, quotes, brackets, ellipsis, angle-brackets, …) that marks a span as prose/glob/type rather than a path.
- **`trackedTargets(root)`** — Runs `git ls-files`, then builds two `Set<string>`s: every path-tail (for O(1) suffix lookups) and the set of top-level root segments. Excludes `.2brain/` mirror pages.
- **`SPELLINGS`** — Ordered list of extensions/suffixes to try when resolving an extensionless token (`.ts`, `/index.ts`, etc.).
- **`resolves(targets, token)`** — Returns true if any spelling of `token` is a key in the `targets` set.
- **`claimsAPath(roots, token)`** — Determines whether a token is asserting a path *in this repo*: either its last segment matches `FILENAME` or its first segment is a known root entry.
- **`readAliases()`** — Parses `tsconfig.json` (strips JSONC comments) and returns the `paths` table as `{ prefix, target }[]`.
- **`throughAliases(aliases, token)`** — Rewrites a `@alias/…` token to its concrete path, or returns `undefined` for unclaimed `@scope/name` (i.e. npm packages).
- **`gitEnvironment`** — Re-exported from `../git-base` for caller convenience.

## Relationships

- **`scripts/docs/check-references.ts`** — Consumes the primitives above (`trackedTargets`, `resolves`, `claimsAPath`, `allowed`, `throughAliases`, …) and layers its own markdown/VitePress resolution policy on top.
- **`scripts/eslint/comment-links.ts`** — Same consumption pattern for the TypeScript-comment side of the check.
- **`scripts/git-base.ts`** — Source of the `gitEnvironment()` helper (re-exported here) used when shelling out to `git ls-files`.
- **`tests/unit/scripts/docs/repo-references.test.ts`** — Unit tests for the exports in this module.

## Notes

- `ALLOWED` is an *argument*, not a blanket exclusion: each entry must carry a reason, and a path with no reason to be absent should surface as a finding.
- `trackedTargets` precomputes a `Set` of path-tails specifically to avoid O(files × tokens × spellings) string comparisons across a sweep.
- `FILENAME` is applied to the *last* segment only, so multi-word suffix conventions (`.visual.cy.ts`) aren't misread as filenames.
- `readAliases` strips `//` line-comments before `JSON.parse` because `tsconfig.json` is JSONC; adding a new top-level directory requires no code change here.
- The module doc comment explicitly states that the two callers *differ on purpose* regarding relative-token and bare-repo-token resolution; those policies are not consolidated here.
