---
source: scripts/eslint/comment-links.ts
sha256: d0727e9564f2bf1fba2001b96748969d3e518afff1d81ba17ab45d762e8a87e0
generated_at: 2026-10-29T01:37:04.694385+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/comment-links.ts

## Purpose

ESLint rule that flags comments referencing `.ts`/`.tsx` files that no longer exist in the repo. It reuses the same resolution machinery as `scripts/docs/check-references.ts` (via `repo-references.ts`) but applies it to comment text rather than Markdown, with comment-specific accommodations: placeholders are skipped, URLs are exempt, and relative paths resolve against the file the comment lives in.

## Key elements

- **`commentLinks`** (exported) — the ESLint rule itself; visits `Program`, iterates all comments, extracts `.ts`/`.tsx` references, and reports a `stale` message for any that do not resolve.
- **`TS_REFERENCE`** — regex matching a full `.ts`/`.tsx` path (one or more segments), where each segment is either a word or a `<placeholder>`. Built so a placeholder segment causes the *entire* match to be captured and skipped, rather than leaving a dangling suffix.
- **`URL_LIKE`** — regex blanked out of comment text before scanning, so external URLs never produce false positives.
- **`resolvesTsReference(reference, filename)`** — resolution logic: placeholder → always OK; `./`/`../` → `existsSync` relative to the comment's file; otherwise → checked against the tracked-file set via `resolves`/`claimsAPath`/`allowedPathPrefix` from `repo-references.ts`.
- **`targets()`** — memoised call to `trackedTargets(ROOT)`, read once per lint run rather than per file.

## Relationships

- **`scripts/docs/repo-references.ts`** — supplies `allowed`, `trackedTargets`, `resolves`, `claimsAPath`; the two checkers share this resolution layer.
- **`scripts/modules-on-disk.ts`** — provides `REPO_ROOT`, used as the root argument to `trackedTargets`.
- **`scripts/eslint/index.ts`** — registers this rule in the plugin's rule set.
- **`tests/unit/scripts/eslint/comment-links.test.ts`** — unit tests exercising the rule's report/skip logic.

## Notes

- **Not type-aware.** Comments are absent from the AST, so the rule walks `sourceCode.getAllComments()` and regex-matches the raw text. No scope or import analysis is possible.
- **Markdown is deliberately out of scope.** The guard against stale doc references is `.gitignore` (plan docs are removed on merge), not a lint rule.
- **Reporting location** is the whole comment's `loc`, not the individual match offset — one report per offending comment, even if it contains multiple stale references.
- **Cache is module-level** (`targetsCache`). It persists across files within a single lint run but resets when the process restarts.
