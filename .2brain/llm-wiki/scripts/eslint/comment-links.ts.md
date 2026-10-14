---
source: scripts/eslint/comment-links.ts
sha256: 7f3a9eef2bd272939b2ac420fe69281dba56780bbd598cd399592df1a1d7bc0e
generated_at: 2026-10-14T07:18:10.035073+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/comment-links.ts

## Purpose

An ESLint rule that flags `.ts`/`.tsx` file references inside comments when the referenced file does not exist in the repository. It closes a gap that `scripts/docs/check-references.ts` covers for Markdown docs but not for code comments: a renamed or deleted file can leave a dangling path in a comment, and this rule catches it at lint time.

## Key elements

- **`commentLinks`** (export) — The ESLint rule (built via `ESLintUtils.RuleCreator.withoutDocs`). On the `Program` node it iterates all comments, strips URL-like text, extracts `.ts`/`.tsx` path references with `TS_REFERENCE`, and reports a `stale` message for any that fail to resolve.
- **`resolvesTsReference(reference, filename)`** (export) — Resolution logic. Returns `true` (skip) for `<placeholder>` segments; resolves `./`/`../` paths relative to the file containing the comment via `existsSync`; otherwise checks suffix-matching against git-tracked files with the shared `ALLOWED` prefix exceptions.
- **`TS_REFERENCE`** (const) — Global regex that captures a full path to a `.ts`/`.tsx` file, where each segment is either a word or a `<placeholder>`. Built so placeholders are captured *within* the match (not stripped after) to avoid dangling suffixes.
- **`URL_LIKE`** (const) — Regex for `\w+://…` and `www.…` strings; blanked out of comment text before path scanning so external links are never false-positived.
- **`targetsCache` / `targets()`** (module-private) — Lazy singleton that calls `trackedTargets(ROOT)` once per lint run and caches the resulting `Set<string>` of tracked paths and their roots, avoiding repeated `git ls-files` invocations.
- **`Options` / `MessageIds`** (types) — Rule takes no options; reports exactly one message id (`stale`).

## Relationships

- **`scripts/docs/repo-references.ts`** — Imports `ROOT`, `allowed`, `trackedTargets`, `resolves`, and `claimsAPath`. This rule reuses the same tracked-file set and suffix-resolution logic that `check-references.ts` uses for Markdown, ensuring both checks agree on what "exists."
- **`scripts/eslint/index.ts`** — Registers `commentLinks` in the ruleset so it runs on every lint pass over source files.
- **`tests/unit/scripts/eslint/comment-links.test.ts`** — Unit-tests the rule's behavior (placeholder skipping, relative-path resolution, URL exemption, stale-reporting).

## Notes

- **Not type-aware.** Comments are absent from the AST, so the rule walks the raw token stream (`sourceCode.getAllComments()`). No type information is used or needed.
- **Markdown is intentionally out of scope.** A root-level plan doc referenced in a comment is *not* flagged here; the guard against stale plan-doc names is `.gitignore` keeping them out of the repo entirely, per the module docstring's rationale.
- **`<placeholder>` handling is regex-internal.** The placeholder is part of the captured match, not filtered post-hoc, so `src/modules/<name>/module.ts` is skipped as a whole rather than leaving `/module.ts` to be checked independently.
- **Cache is per-process, not per-file.** `targetsCache` persists across all files in a single lint run; the first file to trigger a non-relative reference pays the `git ls-files` cost once.
