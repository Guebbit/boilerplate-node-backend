---
source: scripts/eslint/comment-links.ts
sha256: 3e161655ef3807e180087a2dcd8419d10a499bf982af25b11bf6e5e59d2dcfbc
generated_at: 2026-09-23T17:26:46.787520+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/comment-links.ts

## Purpose

ESLint rule that flags `.ts`/`.tsx` file references inside comments which no longer resolve to a tracked file in the repository. It exists so that renamed or deleted files leave no dangling references in prose, complementing the same check that `scripts/docs/check-references.ts` performs over Markdown docs.

## Key elements

- **`commentLinks`** (exported rule) — The ESLint rule object. On `Program` it iterates every comment via `sourceCode.getAllComments()`, blanks out URL-like strings, extracts `.ts`/`.tsx` references with `TS_REFERENCE`, and reports a `stale` message for any that fail resolution.
- **`resolvesTsReference(reference, filename)`** (exported) — Decides whether a single reference is valid. `<placeholder>` segments short-circuit to true; `./`/`../` paths are resolved against the file containing the comment via `existsSync`; all other paths are suffix-matched against the cached set of tracked files, with `ALLOWED` exceptions honoured.
- **`TS_REFERENCE` / `TS_SEGMENT`** — Regexes that capture a full path ending in `.ts`/`.tsx`, where each path segment may be a word or a `<placeholder>`. Built so a placeholder is consumed *inside* the match (avoids leaving a dangling suffix).
- **`URL_LIKE`** — Regex blanked before scanning so external links are never treated as local path references.
- **`targetsCache` / `targets()`** — Module-level lazy singleton that calls `trackedTargets(ROOT)` once per lint run, returning `{ targets, roots }` sets.
- **`Options`, `MessageIds`** — Type parameters: no rule options, single `stale` message.

## Relationships

- **`scripts/docs/repo-references.ts`** — Source of the shared resolution machinery: `ROOT`, `allowed` (allowed path prefixes), `trackedTargets`, `resolves`, and `claimsAPath`. This rule reuses the same "suffix match against git-tracked files" logic that the docs checker uses.
- **`scripts/eslint/index.ts`** — Presumed registration point where `commentLinks` is added to the rule set the project's ESLint config consumes.
- **`tests/unit/scripts/eslint/comment-links.test.ts`** — Unit tests exercising `resolvesTsReference` and the rule's report behaviour.

## Notes

- Deliberately **not type-aware**: comments are absent from the AST, so the rule operates on the raw token/comment stream (`sourceCode.getAllComments()`).
- Markdown files are **not** checked by this rule; that concern is handled by `check-references.ts`. Root-level plan docs are excluded from the repo via `.gitignore`, which is the actual guard against stale references to them.
- `git ls-files` is invoked **once** per lint run (cached in `targetsCache`), not per file, to avoid repeated subprocess calls.
- Relative paths (`./`, `../`) are resolved against the **file containing the comment**, not the repo root — a distinction from how doc-page references are resolved.
- The `<placeholder>` convention (`<name>`, `<paired-frontend>`, etc.) is the author's way of saying "this segment varies" and is exempt from the existence check.
