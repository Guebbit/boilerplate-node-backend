---
source: scripts/eslint/comment-links.ts
sha256: a48cc59a56cd3dea030851493fef12dc11d1e805b0305d099d80ec8770f716b5
generated_at: 2026-10-15T09:41:47.648773+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/comment-links.ts

## Purpose

An ESLint rule that flags stale file references in code comments. Every comment in a linted file is scanned for `.ts`/`.tsx` path mentions; if the referenced file does not exist in the repo (per `git ls-files`), the rule reports a `stale` error. It exists so that renamed or deleted files do not silently leave dangling citations in comments, mirroring the check `scripts/docs/check-references.ts` performs for `docs/*.md` pages.

## Key elements

- **`TS_REFERENCE`** – Regex (built from `TS_SEGMENT`) that matches a full `.ts`/`.tsx` path in arbitrary text, including paths containing `<placeholder>` segments.
- **`URL_LIKE`** – Regex used to blank out external URLs before path scanning, so their path segments are never matched.
- **`targetsCache` / `targets()`** – Module-level cache of `trackedTargets(ROOT)`; read once per lint run rather than per file.
- **`resolvesTsReference(reference, filename)`** *(exported)* – Core resolver. Returns `true` (skip) for `<placeholder>` paths, resolves `./`/`../` paths against the containing file, and otherwise checks the reference by suffix against the tracked-file set, honouring the `ALLOWED` prefix exceptions.
- **`commentLinks`** *(exported)* – The ESLint rule (built via `ESLintUtils.RuleCreator.withoutDocs`). Attaches a `Program` visitor that iterates all comments, strips URLs, extracts `.ts`/`.tsx` references, and reports `stale` for any that fail `resolvesTsReference`.

## Relationships

- **`scripts/docs/repo-references.ts`** – Imports `allowed`, `trackedTargets`, `resolves`, and `claimsAPath`; the shared machinery for "does this path string correspond to a real tracked file."
- **`scripts/modules-on-disk.ts`** – Imports `REPO_ROOT`, used as the base directory passed to `trackedTargets`.
- **`scripts/eslint/index.ts`** – Parent config that registers `commentLinks` in the ESLint plugin's rule set.
- **`tests/unit/scripts/eslint/comment-links.test.ts`** – Unit tests exercising `resolvesTsReference` and the rule's comment-scanning behaviour.

## Notes

- Comments are **not** in the AST; the rule hooks `Program` and calls `context.sourceCode.getAllComments()` to walk the token stream. It is deliberately not type-aware.
- A `<placeholder>` segment (e.g. `src/modules/<name>/module.ts`) is skipped **whole** — the placeholder is baked into the match regex rather than filtered post-hoc, so no dangling sub-path is left behind.
- Markdown files are **out of scope** here; the repo relies on `.gitignore` to exclude ephemeral plan docs rather than a pattern-based comment check.
- Relative references (`./`, `../`) are resolved against the file that contains the comment (unlike doc-page citations, which need a page-relative base).
- The `targets()` cache is module-scoped: one `git ls-files` call per lint run, not per file.
