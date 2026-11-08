---
source: scripts/eslint/comment-links.ts
sha256: d0727e9564f2bf1fba2001b96748969d3e518afff1d81ba17ab45d762e8a87e0
generated_at: 2026-11-08T02:50:20.684963+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/comment-links.ts

## Purpose

An ESLint rule (`commentLinks`) that scans every comment in a source file for `.ts`/`.tsx` path references and reports any that do not resolve to a tracked file. It enforces that comments never point at renamed or deleted source files, sharing its resolution machinery with the docs-reference checker.

## Key elements

- **`commentLinks`** (exported) — the ESLint rule, created via `ESLintUtils.RuleCreator.withoutDocs`. Hooks `Program`, iterates `context.sourceCode.getAllComments()`, and reports one message id (`stale`) per unresolved reference.
- **`TS_REFERENCE`** (regex) — matches a full `.ts`/`.tsx` path, where each segment is either a word or a `<placeholder>`. Placeholders are part of the pattern so the entire reference is captured and skipped as a unit.
- **`URL_LIKE`** (regex) — matched and blanked out of comment text before the reference scan, so external URLs are never treated as local paths.
- **`targets()`** — lazy, module-level cache. First call populates from `trackedTargets(ROOT)` (a single `git ls-files`); subsequent calls reuse the `Set` of tracked files and root names.
- **`resolvesTsReference(reference, filename)`** — core check: skips placeholders, resolves `./`/`../` against the comment's own file via `existsSync`, otherwise delegates to `claimsAPath` / `allowedPathPrefix` / `resolves` from `repo-references`.
- **`Options` / `MessageIds`** — type-level: the rule takes no options and reports exactly one message (`stale`).

## Relationships

- **`scripts/docs/repo-references.ts`** — supplies `trackedTargets`, `resolves`, `claimsAPath`, and `allowed` (the `ALLOWED` exceptions). `commentLinks` is the source-code counterpart to the docs-side reference checker that lives in the same module.
- **`scripts/modules-on-disk.ts`** — provides `REPO_ROOT`, the base directory passed to `trackedTargets` and used for path resolution.
- **`scripts/eslint/index.ts`** — registers/exports `commentLinks` as part of the repo's custom ESLint rule set.
- **`tests/unit/scripts/eslint/comment-links.test.ts`** — unit tests exercising the rule against various comment texts.

## Notes

- The rule is **not type-aware**; it operates on the raw token stream (`getAllComments`) because comments are absent from the AST.
- Relative paths (`./x.ts`, `../y.ts`) are resolved against the **file containing the comment**, not against the repo root — a deliberate difference from the docs checker, which has no "current file."
- `<placeholder>` segments (e.g. `<name>`, `<paired-frontend>`) are recognized *inside* the reference regex, not filtered afterwards. This prevents a partial match like a dangling `/module.ts` after stripping the placeholder.
- `targets()` caches at **module scope**, so `git ls-files` runs at most once per lint process regardless of how many files are linted.
- Markdown files are intentionally **not** checked by this rule; the guard for plan-doc references lives in `.gitignore`.
